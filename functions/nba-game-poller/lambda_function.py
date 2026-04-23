import gzip
import json
import boto3
import os
import random
import time
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from botocore.exceptions import ClientError

from nba_game_poller.nba_api import USER_AGENTS, fetch_nba_data_urllib
from nba_game_poller.kalshi_api import (
    build_kalshi_nba_event_ticker,
    fetch_kalshi_market_candlesticks,
    fetch_kalshi_event_markets,
    get_candlestick_midpoint_or_last,
    get_market_midpoint_or_last,
    normalize_team_code,
)
from nba_game_poller.playbyplay_processing import infer_team_ids_from_actions, process_playbyplay_payload
from nba_game_poller.gamepack_utils import (
    build_box_payload,
    build_player_label_map,
    extract_oncourt_ids,
    extract_oncourt_names,
)
from nba_game_poller.captioning import (
    build_period_captions,
    extract_closed_periods,
    select_caption_checkpoint_periods,
)
from nba_game_poller.storage import upload_json_to_s3, upload_schedule_s3, update_manifest as update_manifest

# --- Configuration & Environment ---
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# 1. Dynamic Resources (From Terraform)
BUCKET = os.environ['DATA_BUCKET']
POLLER_RULE_NAME = os.environ['POLLER_RULE_NAME']

# 2. Optional / Defaults
PREFIX = 'data/'
MANIFEST_KEY = f'{PREFIX}manifest.json'
KICKOFF_SCHEDULE_NAME = 'NBA_Daily_Kickoff'
RECONCILE_SCHEDULE_PREFIX = 'NBA_Reconcile_'
RECONCILE_LEAD_MINUTES = 15
RECONCILE_LATE_MINUTES = 45
SCHEDULE_PREFIX = 'schedule/'
GAMEPACK_PREFIX = 'gamepack/'
GAME_ID_MAP_PREFIX = os.environ.get("GAME_ID_MAP_PREFIX", "private/gameIdMap/")
if GAME_ID_MAP_PREFIX and not GAME_ID_MAP_PREFIX.endswith('/'):
    GAME_ID_MAP_PREFIX += '/'
KALSHI_ENABLED = os.environ.get("KALSHI_ENABLED", "1").strip().lower() not in ("0", "false", "no", "off")
SCHEDULE_FEED_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json"
SCHEDULE_RECONCILE_DAYS = os.environ.get("SCHEDULE_RECONCILE_DAYS", "3")
SCHEDULE_RECONCILE_FUTURE_DAYS = os.environ.get("SCHEDULE_RECONCILE_FUTURE_DAYS", "1")
HALF_POLL_SCHEDULE_PREFIX = "NBA_PollerHalf_"
HALF_POLL_OFFSET_SECONDS = int(os.environ.get("HALF_POLL_OFFSET_SECONDS", "30"))
POLL_WINDOW_SECONDS = float(os.environ.get("POLL_WINDOW_SECONDS", "15"))
AI_CAPTIONS_ENABLED = os.environ.get("AI_CAPTIONS_ENABLED", "1").strip().lower() not in ("0", "false", "no", "off")
GEMINI_API_KEY = (os.environ.get("GEMINI_API_KEY") or "").strip()
GEMINI_MODEL = (os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash").strip() or "gemini-2.5-flash"
try:
    CAPTION_MAX_PLAYERS_PER_TEAM = max(0, int(os.environ.get("CAPTION_MAX_PLAYERS_PER_TEAM", "2")))
except (TypeError, ValueError):
    CAPTION_MAX_PLAYERS_PER_TEAM = 2
try:
    CAPTION_TIMEOUT_SECONDS = max(2.0, float(os.environ.get("CAPTION_TIMEOUT_SECONDS", "8")))
except (TypeError, ValueError):
    CAPTION_TIMEOUT_SECONDS = 8.0

# 3. Security (From Terraform)
LAMBDA_ARN = os.environ.get('LAMBDA_ARN')
SCHEDULER_ROLE_ARN = os.environ.get('SCHEDULER_ROLE_ARN')

# AWS Clients
s3_client = boto3.client('s3', region_name=REGION)
events_client = boto3.client('events', region_name=REGION)
scheduler_client = boto3.client('scheduler', region_name=REGION)
lambda_client = boto3.client('lambda', region_name=REGION)

ET_ZONE = ZoneInfo("America/New_York")
UTC_ZONE = ZoneInfo("UTC")

# --- Main Handler ---

def main_handler(event, context):
    """
    Dispatcher: routes execution based on the 'task' field in the event.
    Pass 'context' to the poller for time-aware sleeping.
    """
    task = event.get('task', 'poller')
    print(f"--- Execution started with task: {task} ---")

    if task == 'manager':
        return manager_logic()
    elif task == 'enable_poller':
        return enable_poller_logic()
    elif task == 'reconcile':
        return reconcile_logic()
    elif task == 'poller_half':
        return poller_logic(context, schedule_half=False)
    elif task == 'poller':
        return poller_logic(context, schedule_half=True)
    elif task == 'caption_worker':
        return caption_worker_logic(event)
    else:
        print(f"Unknown task '{task}'. Defaulting to poller.")
        return poller_logic(context, schedule_half=True)

# ==============================================================================
# 1. MANAGER LOGIC (Runs Daily at Noon)
# ==============================================================================
def manager_logic():
    reconcile_recent_schedule()
    today_str = get_nba_date()
    print(f"Manager: Checking games for {today_str}...")

    games = get_games_from_s3(today_str)
    
    if not games:
        print("Manager: No games found in schedule for today.")
        return

    schedule_reconcile_for_games(games)

    start_dt = get_earliest_start_time(games)
    
    if not start_dt:
        print("Manager: Games exist but have no valid start time. Enabling immediately.")
        return enable_poller_logic()

    # Schedule kickoff at the first tip-off
    kickoff_time = start_dt
    now_utc = datetime.now(ZoneInfo("UTC"))

    # If the kickoff time is in the past (or very close), enable immediately
    if kickoff_time <= now_utc:
        print(f"Manager: Kickoff time {kickoff_time} is in the past. Enabling Poller now.")
        return enable_poller_logic()

    print(f"Manager: First game at {start_dt}. Scheduling kickoff for {kickoff_time}.")
    schedule_kickoff(kickoff_time)

def reconcile_logic():
    print("Reconcile: Running schedule reconciliation.")
    reconcile_recent_schedule()

def create_one_time_schedule(name, run_at_dt, payload):
    at_expression = f"at({run_at_dt.strftime('%Y-%m-%dT%H:%M:%S')})"

    try:
        # Cleanup old schedule if exists
        try:
            scheduler_client.delete_schedule(Name=name)
        except ClientError:
            pass

        scheduler_client.create_schedule(
            Name=name,
            ScheduleExpression=at_expression,
            Target={
                'Arn': LAMBDA_ARN,
                'RoleArn': SCHEDULER_ROLE_ARN,
                'Input': json.dumps(payload)
            },
            FlexibleTimeWindow={'Mode': 'OFF'}
        )
        print(f"Manager: Created one-time schedule '{name}' at {at_expression}")
        return True
    except Exception as e:
        print(f"Manager Error: Failed to schedule {name}: {e}")
        return False

def schedule_kickoff(run_at_dt):
    if not create_one_time_schedule(
        KICKOFF_SCHEDULE_NAME,
        run_at_dt,
        {'task': 'enable_poller'},
    ):
        # Fallback: enable immediately so we don't miss games
        enable_poller_logic()

def schedule_half_poller():
    if not LAMBDA_ARN or not SCHEDULER_ROLE_ARN:
        print("Poller: Missing scheduler config. Skipping half-minute schedule.")
        return False
    run_at_dt = datetime.now(UTC_ZONE) + timedelta(seconds=HALF_POLL_OFFSET_SECONDS)
    run_at_dt = run_at_dt.replace(microsecond=0)
    schedule_name = f"{HALF_POLL_SCHEDULE_PREFIX}{run_at_dt.strftime('%Y%m%dT%H%M%S')}"
    return create_one_time_schedule(
        schedule_name,
        run_at_dt,
        {'task': 'poller_half'},
    )

def schedule_reconcile_for_games(
    games,
    lead_minutes=RECONCILE_LEAD_MINUTES,
    late_minutes=RECONCILE_LATE_MINUTES,
):
    if not games:
        return
    now_utc = datetime.now(UTC_ZONE)
    scheduled = {}
    latest_start = None

    for game in games:
        start_et = parse_start_time_et(game.get('starttime'))
        if not start_et:
            continue
        if not latest_start or start_et > latest_start:
            latest_start = start_et
        run_at = (start_et - timedelta(minutes=lead_minutes)).astimezone(UTC_ZONE)
        run_at = run_at.replace(second=0, microsecond=0)
        if run_at <= now_utc:
            continue
        key = run_at.strftime("%Y%m%d_%H%M")
        scheduled[key] = run_at

    if latest_start and late_minutes is not None:
        late_run = (latest_start + timedelta(minutes=late_minutes)).astimezone(UTC_ZONE)
        late_run = late_run.replace(second=0, microsecond=0)
        if late_run > now_utc:
            late_key = late_run.strftime("%Y%m%d_%H%M")
            schedule_name = f"{RECONCILE_SCHEDULE_PREFIX}LATE_{late_key}"
            create_one_time_schedule(
                schedule_name,
                late_run,
                {'task': 'reconcile'},
            )

    if not scheduled:
        print("Manager: No future pre-tip reconcile schedules needed.")
        return

    for key, run_at in sorted(scheduled.items()):
        schedule_name = f"{RECONCILE_SCHEDULE_PREFIX}{key}"
        create_one_time_schedule(
            schedule_name,
            run_at,
            {'task': 'reconcile'},
        )


# ==============================================================================
# 2. KICKOFF LOGIC (One-Time Trigger)
# ==============================================================================
def enable_poller_logic():
    print(f"Kickoff: Enabling {POLLER_RULE_NAME}...")
    try:
        events_client.enable_rule(Name=POLLER_RULE_NAME)
        print("Kickoff: Success. Polling has begun.")
    except Exception as e:
        print(f"Kickoff Error: {e}")
        raise e

# ==============================================================================
# 3. POLLER LOGIC (Runs Every Minute)
# ==============================================================================
def poller_logic(context, schedule_half=True):
    today_str = get_nba_date()
    games = get_games_from_s3(today_str)

    if not games:
        print("Poller: No games found for today. Disabling self.")
        disable_self()
        return

    game_id_map = load_game_id_map(today_str)
    if game_id_map is None:
        feed = fetch_schedule_feed()
        if feed:
            game_id_map = build_game_id_map_from_feed(feed, today_str)
            if game_id_map:
                upload_game_id_map(today_str, game_id_map)
        else:
            game_id_map = {}

    now_et = datetime.now(ET_ZONE)

    active_games = []
    remaining_games = 0

    for game in games:
        game_key = game.get("id")
        if game_id_map and game_key and game_key in game_id_map:
            game["nbaGameId"] = game_id_map[game_key]
        # Final games can appear late (e.g., bracket finals) without cached ETags yet.
        # Process those once so we still generate a gamepack.
        if (
            is_confirmed_terminal_game(game)
            and game.get("play_etag")
            and game.get("box_etag")
        ):
            continue
        remaining_games += 1
        if has_game_started(game, now_et):
            active_games.append(game)

    if remaining_games == 0:
        print("Poller: All games are final or inactive. Disabling self.")
        # Ensure we do one final upload to mark everything as closed/final in the schedule file
        upload_schedule_s3(
            s3_client=s3_client,
            bucket=BUCKET,
            games_list=games,
            date_str=today_str,
            prefix=SCHEDULE_PREFIX,
        )
        disable_self()
        return

    if not active_games:
        print("Poller: No active games yet. Keeping poller enabled.")
        return

    if schedule_half:
        schedule_half_poller()

    # --- SECURITY: Pick ONE identity for this entire session ---
    session_user_agent = random.choice(USER_AGENTS)

    # --- RANDOMIZATION: Shuffle processing order ---
    random.shuffle(active_games)

    total_games_to_process = len(active_games)
    schedule_dirty = False
    poll_start_time = time.monotonic()

    for i, game in enumerate(active_games):
        game_key = game.get('id')
        
        try:
            # Pass the SESSION user agent down
            is_final, updates = process_game(
                game,
                user_agent=session_user_agent,
                date_str=today_str,
            )
            
            if is_final:
                print(f"Poller: Game {game_key} went Final.")
                update_manifest(
                    s3_client=s3_client,
                    bucket=BUCKET,
                    manifest_key=MANIFEST_KEY,
                    game_id=game_key,
                )
            
            # --- UPDATE SCHEDULE FILE ---
            # If we have updates, apply them to our local 'games' list and upload after polling
            if updates:
                game.update(updates) # Updates the object inside the 'games' list
                schedule_dirty = True

            # --- DYNAMIC SLEEP LOGIC ---
            # We skip sleep after the very last game
            if i < total_games_to_process - 1:
                sleep_duration = calculate_safe_sleep(
                    context,
                    i,
                    total_games_to_process,
                    window_seconds=POLL_WINDOW_SECONDS,
                    window_start_time=poll_start_time,
                )
                if sleep_duration > 0:
                    time.sleep(sleep_duration)

        except Exception as e:
            print(f"Poller Error on game {game_key}: {e}")
    if schedule_dirty:
        print("Poller: Updates found, refreshing schedule file.")
        upload_schedule_s3(
            s3_client=s3_client,
            bucket=BUCKET,
            games_list=games,
            date_str=today_str,
            prefix=SCHEDULE_PREFIX,
        )
    # Update the global "Init State" file so the frontend knows where to land
    upload_init_state(games, today_str)

def upload_init_state(games_today, date_str):
    """
    Determines the best 'landing page' state for users.
    Logic:
    1. If there is a Live game, point to it.
    2. If all games are Final, point to the first game of the day.
    3. If there are some Final games today, point to the last Final game.
    4. If today is empty (or all games are effectively 'tomorrow' due to time), 
       you could point to yesterday (optional, but 'get_nba_date' handles most of this).
    """
    
    best_game_id = None
    
    # Sort: Live > All Final (first game) > Some Final (last game) > Scheduled (first)
    live_games = [g for g in games_today if status_indicates_live(g)]
    final_games = [g for g in games_today if is_terminal_status(g.get('status'))]
    all_games_final = bool(games_today) and len(final_games) == len(games_today)
    
    if live_games:
        best_game_id = live_games[0]['id']
    elif all_games_final:
        games_today.sort(key=lambda x: x.get('starttime', ''))
        best_game_id = games_today[0]['id']
    elif final_games:
        best_game_id = final_games[-1]['id']
    elif games_today:
        games_today.sort(key=lambda x: x.get('starttime', ''))
        best_game_id = games_today[0]['id']

    # Payload
    init_data = {
        "date": date_str,
        "autoSelectGameId": best_game_id,
        "lastUpdated": datetime.now(UTC_ZONE).isoformat()
    }
    
    # Upload to S3
    s3_client.put_object(
        Bucket=BUCKET,
        Key=f"{PREFIX}init.json",
        Body=json.dumps(init_data),
        ContentType='application/json',
        CacheControl='max-age=60'
    )
    print(f"Updated init.json -> Date: {date_str}, Game: {best_game_id}")

def calculate_safe_sleep(context, current_index, total_items, window_seconds=None, window_start_time=None):
    """
    Calculates a sleep time that fits within the remaining Lambda execution window,
    and optionally within a tighter per-poll window.
    """
    # Desired "Polite" range
    MIN_SLEEP = 1.0
    MAX_SLEEP = 3.0

    items_remaining = total_items - 1 - current_index
    if items_remaining < 1:
        return 0.0

    # Remaining Lambda time in seconds.
    lambda_remaining_sec = None
    if context and hasattr(context, 'get_remaining_time_in_millis'):
        remaining_ms = context.get_remaining_time_in_millis()
        lambda_remaining_sec = remaining_ms / 1000.0

    # Optional poll window remaining time.
    window_remaining_sec = None
    if window_seconds is not None and window_start_time is not None:
        elapsed = time.monotonic() - window_start_time
        window_remaining_sec = window_seconds - elapsed

    # If neither constraint exists, return polite jitter.
    if lambda_remaining_sec is None and window_remaining_sec is None:
        return random.uniform(MIN_SLEEP, MAX_SLEEP)

    # Estimate time needed for future network calls (1.5s per remaining game).
    estimated_work_sec = items_remaining * 1.5

    # Compute sleep budgets for each constraint and use the tightest.
    budget_candidates = []
    if lambda_remaining_sec is not None:
        budget_candidates.append(lambda_remaining_sec - estimated_work_sec - 5.0)
    if window_remaining_sec is not None:
        budget_candidates.append(window_remaining_sec - estimated_work_sec - 0.5)

    time_budget_for_sleep = min(budget_candidates)
    if time_budget_for_sleep <= 0:
        return 0.0

    max_allowable_sleep = time_budget_for_sleep / items_remaining
    actual_upper_limit = min(MAX_SLEEP, max_allowable_sleep)

    if actual_upper_limit < 0.05:
        return 0.0

    actual_lower_limit = min(MIN_SLEEP, actual_upper_limit)
    return random.uniform(actual_lower_limit, actual_upper_limit)

def disable_self():
    try:
        events_client.disable_rule(Name=POLLER_RULE_NAME)
        print(f"Poller: Successfully disabled {POLLER_RULE_NAME}")
    except Exception as e:
        print(f"Poller Error: Failed to disable rule: {e}")


def enqueue_caption_worker(*, game_key, latest_closed_period, status_text=""):
    if not LAMBDA_ARN:
        return False
    payload = {
        "task": "caption_worker",
        "gameKey": game_key,
        "closedThrough": latest_closed_period,
        "status": status_text or "",
    }
    try:
        lambda_client.invoke(
            FunctionName=LAMBDA_ARN,
            InvocationType="Event",
            Payload=json.dumps(payload).encode("utf-8"),
        )
        return True
    except Exception as e:
        print(f"Caption enqueue error for {game_key}: {e}")
        return False


def caption_worker_logic(event):
    game_key = (event.get("gameKey") or "").strip()
    if not game_key:
        print("CaptionWorker: Missing gameKey.")
        return
    if not AI_CAPTIONS_ENABLED:
        print("CaptionWorker: Disabled by configuration.")
        return
    if not GEMINI_API_KEY:
        print("CaptionWorker: GEMINI_API_KEY not configured.")
        return

    existing = load_gamepack(game_key)
    if not isinstance(existing, dict):
        print(f"CaptionWorker: No gamepack for {game_key}.")
        return

    flow_payload = existing.get("flow")
    box_payload = existing.get("box")
    if not isinstance(flow_payload, dict) or not isinstance(box_payload, dict):
        print(f"CaptionWorker: Missing flow/box for {game_key}.")
        return

    status_text = (event.get("status") or "").strip()
    existing_captions = flow_payload.get("captions")
    merged_captions = build_period_captions(
        actions=None,
        flow_payload=flow_payload,
        box_payload=box_payload,
        existing_captions=existing_captions,
        api_key=GEMINI_API_KEY,
        model=GEMINI_MODEL,
        max_players_per_team=CAPTION_MAX_PLAYERS_PER_TEAM,
        timeout_seconds=CAPTION_TIMEOUT_SECONDS,
        include_final_overtime=is_final_status(status_text),
    )
    if not isinstance(merged_captions, dict):
        return
    if isinstance(existing_captions, dict) and merged_captions == existing_captions:
        return

    next_flow = dict(flow_payload)
    next_flow["captions"] = merged_captions
    gamepack = dict(existing)
    gamepack["flow"] = next_flow
    upload_json_to_s3(
        s3_client=s3_client,
        bucket=BUCKET,
        prefix=PREFIX,
        key=f"{GAMEPACK_PREFIX}{game_key}.json",
        data=gamepack,
        is_final=is_final_status(status_text),
    )
    print(f"CaptionWorker: Uploaded captions for {game_key}.")

# ==============================================================================
# CORE PROCESSING (Fetch -> Upload -> Update)
# ==============================================================================
def process_game(game_item, user_agent=None, date_str=None):
    """
    Returns (is_final, updates_dict)
    """
    game_key = game_item.get('id') or ""
    nba_game_id = coerce_nba_game_id(game_item.get('nbaGameId')) or coerce_nba_game_id(game_key)
    if not game_key:
        game_key = str(nba_game_id or "")
    if not nba_game_id:
        print(f"Poller: Missing nbaGameId for {game_key}, skipping.")
        return False, {}
    
    # Get stored ETags
    last_play_etag = game_item.get('play_etag')
    last_box_etag = game_item.get('box_etag')

    urls = {
        'play': f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{nba_game_id}.json",
        'box': f"https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{nba_game_id}.json"
    }

    # Fetch Data
    play_data, play_etag = fetch_nba_data_urllib(urls['play'], last_play_etag, user_agent)
    box_data, box_etag = fetch_nba_data_urllib(urls['box'], last_box_etag, user_agent)

    updates = {}
    is_game_final = False
    is_play_final = False
    play_final_home_score = None
    play_final_away_score = None
    processed = None
    slim_box = None
    actions = []
    last_action = None
    existing_gamepack = None
    existing_gamepack_loaded = False

    def load_existing_gamepack_once():
        nonlocal existing_gamepack, existing_gamepack_loaded
        if not existing_gamepack_loaded:
            existing_gamepack = load_gamepack(game_key)
            existing_gamepack_loaded = True
        return existing_gamepack

    # Best-effort team IDs for play-by-play processing (used when box is a 304).
    home_team_id = None
    away_team_id = None
    play_game = play_data.get("game", {}) if play_data else {}
    if play_game:
        home_team_id = play_game.get("homeTeamId") or play_game.get("homeTeam", {}).get("teamId")
        away_team_id = play_game.get("awayTeamId") or play_game.get("awayTeam", {}).get("teamId")

    box_game = box_data.get("game", {}) if box_data else {}
    if box_game:
        home_team_id = home_team_id or box_game.get("homeTeam", {}).get("teamId") or box_game.get("homeTeamId")
        away_team_id = away_team_id or box_game.get("awayTeam", {}).get("teamId") or box_game.get("awayTeamId")

    home_team_id = home_team_id or game_item.get("homeTeamId")
    away_team_id = away_team_id or game_item.get("awayTeamId")
    home_player_labels = build_player_label_map(box_game.get("homeTeam")) if box_game else {}
    away_player_labels = build_player_label_map(box_game.get("awayTeam")) if box_game else {}

    # --- 1. Play by Play ---
    if play_data:
        actions = play_data.get('game', {}).get('actions', [])
        last_action = actions[-1] if actions else None

        if last_action:
            last_desc = last_action.get('description', '').strip()
            is_play_final = last_desc.startswith('Game End')
            play_final_home_score = parse_score(last_action.get('scoreHome'))
            play_final_away_score = parse_score(last_action.get('scoreAway'))

        if actions and not (home_team_id and away_team_id):
            inferred_away, inferred_home = infer_team_ids_from_actions(actions)
            away_team_id = away_team_id or inferred_away
            home_team_id = home_team_id or inferred_home

        seed_home = []
        seed_away = []
        seed_home_ids = []
        seed_away_ids = []
        seed_period = (last_action or {}).get('period') or 1
        seed_clock = (last_action or {}).get('clock') or box_game.get('gameClock')
        if seed_period == 1 and box_game:
            seed_home = extract_oncourt_names(box_game.get("homeTeam"))
            seed_away = extract_oncourt_names(box_game.get("awayTeam"))
            seed_home_ids = extract_oncourt_ids(box_game.get("homeTeam"))
            seed_away_ids = extract_oncourt_ids(box_game.get("awayTeam"))

        if home_team_id and away_team_id and (actions or seed_home or seed_away):
            processed = process_playbyplay_payload(
                game_id=nba_game_id,
                actions=actions,
                away_team_id=away_team_id,
                home_team_id=home_team_id,
                away_player_labels=away_player_labels,
                home_player_labels=home_player_labels,
                include_actions=False,
                include_all_actions=False,
                seed_home=seed_home,
                seed_away=seed_away,
                seed_home_ids=seed_home_ids,
                seed_away_ids=seed_away_ids,
                seed_clock=seed_clock,
                seed_period=seed_period,
            )

        updates['play_etag'] = play_etag

    # --- 2. Box Score ---
    if box_data:
        status_text = box_game.get('gameStatusText', '').strip()
        is_game_final = status_text.startswith('Final')

        slim_box = build_box_payload(box_game)

        # Cache stable IDs so play-by-play processing can run even if boxscore is a 304 later.
        home_team_id = box_game.get("homeTeam", {}).get("teamId") or box_game.get("homeTeamId")
        away_team_id = box_game.get("awayTeam", {}).get("teamId") or box_game.get("awayTeamId")
        
        # Prepare schedule updates
        updates.update({
            'box_etag': box_etag,
            'status': status_text,
            'time': trim_clock_value(box_game.get('gameClock', '')) or '',
            'homescore': box_game.get('homeTeam', {}).get('score', 0),
            'awayscore': box_game.get('awayTeam', {}).get('score', 0),
            'homerecord': f"{box_game.get('homeTeam', {}).get('wins','0')}-{box_game.get('homeTeam', {}).get('losses','0')}",
            'awayrecord': f"{box_game.get('awayTeam', {}).get('wins','0')}-{box_game.get('awayTeam', {}).get('losses','0')}",
            'homeTeamId': home_team_id,
            'awayTeamId': away_team_id,
        })

    # If the play feed ended but box status regressed (or lags), promote schedule state to Final.
    if is_play_final:
        if not is_final_status(updates.get('status')):
            updates['status'] = 'Final'
            updates['time'] = ''
        if not is_game_final:
            updates['finalConfirmed'] = False
            existing_pending = game_item.get('finalPendingSince')
            if isinstance(existing_pending, str) and existing_pending.strip():
                updates['finalPendingSince'] = existing_pending
            else:
                updates['finalPendingSince'] = datetime.now(UTC_ZONE).isoformat()
        else:
            updates['finalConfirmed'] = True
            updates['finalPendingSince'] = ''

        incoming_home = parse_score(updates.get('homescore'))
        incoming_away = parse_score(updates.get('awayscore'))
        existing_home = parse_score(game_item.get('homescore'))
        existing_away = parse_score(game_item.get('awayscore'))

        if incoming_home == 0 and incoming_away == 0:
            if (
                play_final_home_score is not None and play_final_away_score is not None
                and (play_final_home_score > 0 or play_final_away_score > 0)
            ):
                updates['homescore'] = play_final_home_score
                updates['awayscore'] = play_final_away_score
            elif (
                existing_home is not None and existing_away is not None
                and (existing_home > 0 or existing_away > 0)
            ):
                updates['homescore'] = existing_home
                updates['awayscore'] = existing_away

    existing_flow = None
    if play_data is None or box_data is None:
        existing = load_existing_gamepack_once()
        existing_flow = (existing or {}).get("flow")
    elif KALSHI_ENABLED and actions:
        existing = load_existing_gamepack_once()
        existing_flow = (existing or {}).get("flow")

    odds_snapshot = build_kalshi_odds_snapshot(
        game_item=game_item,
        box_game=box_game,
        last_action=last_action,
        existing_flow=existing_flow,
        actions=actions,
        date_str=date_str,
        user_agent=user_agent,
    )

    if play_data is None and box_data is None and not odds_snapshot:
        return False, {}

    if processed is not None and AI_CAPTIONS_ENABLED and GEMINI_API_KEY and LAMBDA_ARN:
        closed_periods = extract_closed_periods(actions)
        status_for_worker = updates.get("status") or game_item.get("status") or ""
        caption_checkpoints = select_caption_checkpoint_periods(
            closed_periods,
            include_final_overtime=is_final_status(status_for_worker),
        )
        if caption_checkpoints:
            latest_closed_period = max(caption_checkpoints)
            requested_through = parse_positive_int(game_item.get("captions_requested_through"), fallback=0)
            if latest_closed_period > requested_through:
                if enqueue_caption_worker(
                    game_key=game_key,
                    latest_closed_period=latest_closed_period,
                    status_text=status_for_worker,
                ):
                    updates["captions_requested_through"] = latest_closed_period

    if processed is not None or slim_box is not None or odds_snapshot:
        if processed is None or slim_box is None:
            existing = load_existing_gamepack_once()
            if processed is None:
                processed = (existing or {}).get("flow")
            if slim_box is None:
                slim_box = (existing or {}).get("box")
            if existing_flow is None:
                existing_flow = (existing or {}).get("flow")

        if isinstance(processed, dict) and not isinstance(processed.get("captions"), dict):
            existing = load_existing_gamepack_once()
            existing_flow = (existing or {}).get("flow")
            existing_captions = existing_flow.get("captions") if isinstance(existing_flow, dict) else None
            if isinstance(existing_captions, dict):
                processed = dict(processed)
                processed["captions"] = existing_captions

        if existing_flow is None:
            existing = load_existing_gamepack_once()
            existing_flow = (existing or {}).get("flow")

        processed = merge_flow_odds(processed, existing_flow, odds_snapshot)

        if processed is not None and slim_box is not None:
            gamepack = {
                "v": 1,
                "id": nba_game_id,
                "publicId": game_key,
                "box": slim_box,
                "flow": processed,
            }
            upload_json_to_s3(
                s3_client=s3_client,
                bucket=BUCKET,
                prefix=PREFIX,
                key=f"{GAMEPACK_PREFIX}{game_key}.json",
                data=gamepack,
                is_final=is_game_final,
            )
        else:
            print(f"Poller: Skipping gamepack upload for {game_key}, missing data.")

    if updates:
        updates = protect_final_schedule_state(game_item, updates)

    return is_game_final, updates


def load_gamepack(game_key):
    key = f"{PREFIX}{GAMEPACK_PREFIX}{game_key}.json.gz"
    try:
        resp = s3_client.get_object(Bucket=BUCKET, Key=key)
        body = resp["Body"].read()
        if body.startswith(b"\x1f\x8b"):
            body = gzip.decompress(body)
        return json.loads(body)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404", "NotFound"):
            return None
        print(f"Poller: Failed to load gamepack {game_key}: {e}")
        return None
    except Exception as e:
        print(f"Poller: Failed to load gamepack {game_key}: {e}")
        return None


def clock_to_seconds_remaining(clock_value):
    if not clock_value or not isinstance(clock_value, str):
        return None
    text = clock_value.strip()
    if text.startswith("PT") and text.endswith("S"):
        text = text[2:-1]
        if "M" in text:
            mins_part, sec_part = text.split("M", 1)
            try:
                return int(mins_part or 0) * 60 + float(sec_part or 0)
            except ValueError:
                return None
    if ":" in text:
        mins_part, sec_part = text.split(":", 1)
        try:
            return int(mins_part or 0) * 60 + float(sec_part or 0)
        except ValueError:
            return None
    if "." in text:
        whole_part, fractional_part = text.split(".", 1)
    else:
        whole_part, fractional_part = text, ""
    if whole_part.isdigit() and len(whole_part) >= 3:
        mins_part = whole_part[:-2]
        sec_part = whole_part[-2:]
        if fractional_part:
            sec_text = f"{sec_part}.{fractional_part}"
        else:
            sec_text = sec_part
        try:
            return int(mins_part or 0) * 60 + float(sec_text or 0)
        except ValueError:
            return None
    return None


def build_odds_sort_key(entry):
    quarter = parse_positive_int(entry.get("quarter"), fallback=0)
    remaining = clock_to_seconds_remaining(entry.get("time"))
    if remaining is None:
        remaining = 0
    return quarter, -remaining


def merge_odds_timeline(existing_timeline, snapshot):
    normalized = []
    for entry in existing_timeline or []:
        if not isinstance(entry, dict):
            continue
        quarter = parse_positive_int(entry.get("quarter"), fallback=0)
        time_value = trim_clock_value(entry.get("time")) or entry.get("time")
        if quarter <= 0 or not time_value:
            continue
        try:
            away_prob = float(entry.get("awayWinProb"))
        except (TypeError, ValueError):
            continue
        if away_prob < 0 or away_prob > 1:
            continue
        normalized.append({
            "quarter": quarter,
            "time": time_value,
            "awayWinProb": away_prob,
            "source": entry.get("source") or None,
            "marketTicker": entry.get("marketTicker") or None,
            "eventTicker": entry.get("eventTicker") or None,
        })

    snapshots = []
    if isinstance(snapshot, dict):
        snapshots = [snapshot]
    elif isinstance(snapshot, list):
        snapshots = snapshot

    for entry in snapshots:
        if not isinstance(entry, dict):
            continue
        quarter = parse_positive_int(entry.get("quarter"), fallback=0)
        time_value = trim_clock_value(entry.get("time")) or entry.get("time")
        if quarter <= 0 or not time_value:
            continue
        try:
            away_prob = float(entry.get("awayWinProb"))
        except (TypeError, ValueError):
            continue
        if away_prob < 0 or away_prob > 1:
            continue
        normalized.append({
            "quarter": quarter,
            "time": time_value,
            "awayWinProb": away_prob,
            "source": entry.get("source") or None,
            "marketTicker": entry.get("marketTicker") or None,
            "eventTicker": entry.get("eventTicker") or None,
        })

    if not normalized:
        return []

    normalized.sort(key=build_odds_sort_key)
    merged = []
    for entry in normalized:
        if (
            merged
            and merged[-1].get("quarter") == entry.get("quarter")
            and merged[-1].get("time") == entry.get("time")
        ):
            merged[-1] = entry
            continue
        merged.append(entry)
    return merged[-720:]


def parse_live_period(status_text):
    text = normalize_status(status_text)
    if not text:
        return None
    if text.startswith("halftime") or text.startswith("half"):
        return 2
    if text.startswith("q") and len(text) >= 2 and text[1].isdigit():
        return int(text[1])
    if text.startswith("ot"):
        return 5
    if text.endswith("ot"):
        try:
            return 4 + int(text[:-2])
        except ValueError:
            return 5
    return None


def resolve_game_team_codes(game_item, box_game):
    away_code = normalize_team_code(
        (box_game.get("awayTeam") or {}).get("teamTricode") if isinstance(box_game, dict) else None
    ) or normalize_team_code(game_item.get("awayteam"))
    home_code = normalize_team_code(
        (box_game.get("homeTeam") or {}).get("teamTricode") if isinstance(box_game, dict) else None
    ) or normalize_team_code(game_item.get("hometeam"))
    return away_code, home_code


def parse_action_actual_ts(action):
    raw = (action or {}).get("timeActual")
    if not isinstance(raw, str) or not raw.strip():
        return None

    text = raw.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"

    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC_ZONE)
    else:
        parsed = parsed.astimezone(UTC_ZONE)

    return parsed.timestamp()


def align_ts_to_minute_bucket_end(ts_value):
    try:
        total_seconds = int(float(ts_value))
    except (TypeError, ValueError):
        return None
    if total_seconds < 0:
        return None
    return ((total_seconds + 59) // 60) * 60


def resolve_kalshi_market_pair(markets, away_code, home_code):
    away_market = None
    home_market = None
    for market in markets or []:
        if not isinstance(market, dict):
            continue
        ticker = normalize_team_code((market.get("ticker") or "").split("-")[-1])
        if ticker == away_code:
            away_market = market
        elif ticker == home_code:
            home_market = market
    return away_market, home_market


def build_market_odds_snapshot(position, market, event_ticker, invert=False):
    if not position or not isinstance(market, dict):
        return None

    away_prob, source = get_market_midpoint_or_last(market)
    if away_prob is None:
        return None
    if invert:
        away_prob = max(0.0, min(1.0, 1.0 - away_prob))
        source = f"inverted-{source}" if source else "inverted"

    return {
        **position,
        "awayWinProb": round(float(away_prob), 4),
        "source": source,
        "marketTicker": market.get("ticker"),
        "eventTicker": event_ticker,
    }


def build_kalshi_action_odds_snapshots(*, actions, existing_flow, market, event_ticker, invert, user_agent):
    if not isinstance(existing_flow, dict) or not isinstance(market, dict):
        return []

    previous_seq = parse_positive_int((existing_flow.get("last") or {}).get("seq"), fallback=0)
    if previous_seq <= 0:
        return []

    candidate_actions = []
    for action in actions or []:
        if not isinstance(action, dict):
            continue
        seq = parse_positive_int(action.get("actionNumber"), fallback=0)
        if seq <= previous_seq:
            continue
        period = parse_positive_int(action.get("period"), fallback=0)
        time_value = trim_clock_value(action.get("clock")) or (action.get("clock") or "").strip()
        actual_ts = parse_action_actual_ts(action)
        if period <= 0 or not time_value or actual_ts is None:
            continue
        candidate_actions.append(
            {
                "seq": seq,
                "quarter": period,
                "time": time_value,
                "actualTs": actual_ts,
            }
        )

    if not candidate_actions:
        return []

    start_ts = int(min(action["actualTs"] for action in candidate_actions))
    end_ts = max(start_ts + 60, int(max(action["actualTs"] for action in candidate_actions)) + 60)
    series_ticker = str(event_ticker).split("-", 1)[0]
    candles = fetch_kalshi_market_candlesticks(
        series_ticker,
        market.get("ticker"),
        start_ts,
        end_ts,
        period_interval=1,
        include_latest_before_start=True,
        user_agent=user_agent,
    )
    if not candles:
        return []

    candle_samples = []
    for candle in candles:
        if not isinstance(candle, dict):
            continue
        end_period_ts = parse_positive_int(candle.get("end_period_ts"), fallback=0)
        if end_period_ts <= 0:
            continue
        away_prob, source = get_candlestick_midpoint_or_last(candle)
        if away_prob is None:
            continue
        if invert:
            away_prob = max(0.0, min(1.0, 1.0 - away_prob))
            source = f"inverted-{source}" if source else "inverted"
        candle_samples.append(
            {
                "endTs": end_period_ts,
                "awayWinProb": round(float(away_prob), 4),
                "source": source,
            }
        )

    if not candle_samples:
        return []

    candle_samples.sort(key=lambda entry: entry["endTs"])
    snapshots = []
    for action in candidate_actions:
        bucket_end_ts = align_ts_to_minute_bucket_end(action["actualTs"])
        if bucket_end_ts is None:
            continue
        sample = None
        for candidate in candle_samples:
            if candidate["endTs"] <= bucket_end_ts:
                sample = candidate
            else:
                break
        if sample is None:
            continue
        snapshots.append(
            {
                "quarter": action["quarter"],
                "time": action["time"],
                "awayWinProb": sample["awayWinProb"],
                "source": sample["source"],
                "marketTicker": market.get("ticker"),
                "eventTicker": event_ticker,
            }
        )

    return snapshots


def resolve_odds_position(game_item, box_game=None, last_action=None, existing_flow=None):
    status_text = ""
    if isinstance(box_game, dict):
        status_text = (box_game.get("gameStatusText") or "").strip()
    if not status_text:
        status_text = (game_item.get("status") or "").strip()

    period = parse_live_period(status_text)
    if not period and isinstance(last_action, dict):
        period = parse_positive_int(last_action.get("period"), fallback=0)
    if not period and isinstance(existing_flow, dict):
        period = parse_positive_int((existing_flow.get("last") or {}).get("quarter"), fallback=0)

    clock = ""
    if isinstance(box_game, dict):
        clock = (box_game.get("gameClock") or "").strip()
    if not clock:
        clock = (game_item.get("time") or "").strip()
    if not clock and isinstance(last_action, dict):
        clock = (last_action.get("clock") or "").strip()
    if not clock and isinstance(existing_flow, dict):
        clock = str((existing_flow.get("last") or {}).get("time") or "").strip()

    if period <= 0 or not clock:
        return None

    return {
        "quarter": period,
        "time": trim_clock_value(clock) or clock,
    }


def build_kalshi_odds_snapshot(*, game_item, box_game, last_action, existing_flow, actions, date_str, user_agent):
    if not KALSHI_ENABLED:
        return []

    away_code, home_code = resolve_game_team_codes(game_item, box_game)
    if not date_str or not away_code or not home_code:
        return []

    position = resolve_odds_position(
        game_item,
        box_game=box_game,
        last_action=last_action,
        existing_flow=existing_flow,
    )

    event_ticker = build_kalshi_nba_event_ticker(date_str, away_code, home_code)
    if not event_ticker:
        return []

    markets = fetch_kalshi_event_markets(event_ticker, user_agent=user_agent)
    if not markets:
        return []

    away_market, home_market = resolve_kalshi_market_pair(markets, away_code, home_code)
    selected_market = away_market or home_market
    if not isinstance(selected_market, dict):
        return []

    invert = selected_market is home_market and away_market is None
    snapshots = build_kalshi_action_odds_snapshots(
        actions=actions,
        existing_flow=existing_flow,
        market=selected_market,
        event_ticker=event_ticker,
        invert=invert,
        user_agent=user_agent,
    )

    current_snapshot = build_market_odds_snapshot(position, selected_market, event_ticker, invert=invert)
    if current_snapshot is not None:
        snapshots.append(current_snapshot)

    return snapshots


def merge_flow_odds(processed_flow, existing_flow, odds_snapshot):
    base_flow = processed_flow if isinstance(processed_flow, dict) else existing_flow
    if not isinstance(base_flow, dict):
        return base_flow

    merged_odds = merge_odds_timeline((existing_flow or {}).get("odds"), odds_snapshot)
    if not merged_odds:
        return base_flow

    next_flow = dict(base_flow)
    next_flow["odds"] = merged_odds
    return next_flow


def get_nba_date():
    """
    Returns today's date in 'YYYY-MM-DD' format, adjusted for NBA "day"
    (where games finishing at 1AM count for the previous calendar day).
    """
    # Using ZoneInfo for accuracy
    now_et = datetime.now(ET_ZONE)
    # If it's before 4 AM, count it as "yesterday" (for late night games)
    if now_et.hour < 4:
        now_et = now_et - timedelta(days=1)
    return now_et.strftime('%Y-%m-%d')

TERMINAL_STATUS_PREFIXES = (
    'final',
    'postponed',
    'cancelled',
    'canceled',
    'ppd',
)

PREGAME_STATUS_PREFIXES = (
    'scheduled',
    'pre',
    'tbd',
)

def normalize_status(status_text):
    return (status_text or '').strip().lower()

def is_terminal_status(status_text):
    status = normalize_status(status_text)
    return any(status.startswith(prefix) for prefix in TERMINAL_STATUS_PREFIXES)

def is_confirmed_terminal_game(game):
    if not isinstance(game, dict):
        return False
    status_text = game.get('status')
    if not is_terminal_status(status_text):
        return False
    if is_final_status(status_text):
        return game.get('finalConfirmed') is not False
    return True

def is_final_status(status_text):
    status = normalize_status(status_text)
    return status.startswith('final')

def is_pregame_status(status_text):
    status = normalize_status(status_text)
    if not status:
        return False
    if status.startswith(PREGAME_STATUS_PREFIXES) or 'tbd' in status:
        return True
    if ':' in status and (
        ' am' in status
        or ' pm' in status
        or status.endswith('am')
        or status.endswith('pm')
        or ' et' in status
    ):
        return True
    return False

def parse_score(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None

def protect_final_schedule_state(existing_game, incoming_updates):
    if not isinstance(existing_game, dict) or not isinstance(incoming_updates, dict):
        return incoming_updates

    existing_status = existing_game.get('status')
    if not is_final_status(existing_status):
        return incoming_updates

    incoming_status = incoming_updates.get('status')
    if not isinstance(incoming_status, str) or not incoming_status.strip():
        return incoming_updates

    incoming_is_terminal = is_terminal_status(incoming_status)
    incoming_is_final = is_final_status(incoming_status)

    # Never allow a known final game to regress to scheduled/pregame states.
    if not incoming_is_terminal or is_pregame_status(incoming_status):
        safe = dict(incoming_updates)
        safe['status'] = existing_status
        safe['homescore'] = existing_game.get('homescore', safe.get('homescore', 0))
        safe['awayscore'] = existing_game.get('awayscore', safe.get('awayscore', 0))
        safe['time'] = existing_game.get('time', safe.get('time', ''))
        return safe

    # Guard against occasional final score rollbacks (e.g., 0-0 from stale payloads).
    if incoming_is_final:
        existing_home = parse_score(existing_game.get('homescore'))
        existing_away = parse_score(existing_game.get('awayscore'))
        incoming_home = parse_score(incoming_updates.get('homescore'))
        incoming_away = parse_score(incoming_updates.get('awayscore'))

        if (
            existing_home is not None and existing_away is not None
            and (existing_home > 0 or existing_away > 0)
            and incoming_home == 0 and incoming_away == 0
        ):
            safe = dict(incoming_updates)
            safe['homescore'] = existing_game.get('homescore')
            safe['awayscore'] = existing_game.get('awayscore')
            return safe

    return incoming_updates

def status_indicates_live(game):
    status = normalize_status(game.get('status'))
    if not status:
        return False
    if is_terminal_status(status):
        return False
    if status.startswith(PREGAME_STATUS_PREFIXES) or 'tbd' in status:
        return False
    if status.startswith('q') and any(ch.isdigit() for ch in status):
        return True
    if ':' in status and (
        ' am' in status
        or ' pm' in status
        or status.endswith('am')
        or status.endswith('pm')
        or ' et' in status
    ):
        return False
    if game.get('time') or game.get('clock'):
        return True
    if any(token in status for token in (
        'qtr',
        'quarter',
        'half',
        'halftime',
        'in progress',
        'end of',
    )):
        return True
    if 'overtime' in status or status == 'ot' or ' ot' in status:
        return True
    if status.endswith('ot') and status[:-2].isdigit():
        return True
    return False

def parse_start_time_et(start_time):
    """
    Parse a game start time and normalize it to Eastern Time.
    The NBA API sometimes labels ET times with 'Z', so treat 'Z' as ET.
    """
    if not start_time:
        return None
    ts = start_time.strip()
    if ts.endswith('Z'):
        ts = ts[:-1]
    try:
        dt = datetime.fromisoformat(ts)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=ET_ZONE)
    return dt.astimezone(ET_ZONE)

def parse_start_time_utc(start_time):
    if not start_time:
        return None
    ts = start_time.strip()
    if ts.endswith('Z'):
        ts = f"{ts[:-1]}+00:00"
    try:
        dt = datetime.fromisoformat(ts)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC_ZONE)
    return dt.astimezone(UTC_ZONE)

def has_game_started(game, now_et):
    if status_indicates_live(game):
        return True
    start_et = parse_start_time_et(game.get('starttime'))
    if not start_et:
        return False
    return now_et >= start_et

def get_games_from_s3(date_str):
    key = f"{SCHEDULE_PREFIX}{date_str}.json.gz"
    try:
        resp = s3_client.get_object(Bucket=BUCKET, Key=key)
        payload = resp["Body"].read()
        try:
            payload = gzip.decompress(payload)
        except OSError:
            pass
        data = json.loads(payload.decode("utf-8"))
        return data if isinstance(data, list) else []
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404", "NotFound"):
            return []
        print(f"S3 Schedule Error: {e}")
        return []
    except Exception as e:
        print(f"S3 Schedule Error: {e}")
        return []

def reconcile_recent_schedule():
    past_days = parse_positive_int(SCHEDULE_RECONCILE_DAYS, 3)
    future_days = parse_positive_int(SCHEDULE_RECONCILE_FUTURE_DAYS, 1)
    if past_days <= 0 and future_days <= 0:
        return

    today_str = get_nba_date()
    try:
        today = datetime.strptime(today_str, "%Y-%m-%d").date()
    except ValueError:
        print(f"Reconcile: Invalid NBA date '{today_str}', skipping.")
        return

    feed = fetch_schedule_feed()
    if not feed:
        print("Reconcile: Schedule feed unavailable, skipping.")
        return

    feed_map = build_schedule_feed_map(feed)
    if not feed_map:
        print("Reconcile: Schedule feed empty, skipping.")
        return
    updated = 0

    start_offset = -past_days if past_days > 0 else 0
    end_offset = future_days if future_days > 0 else 0

    # Reconcile prior days, today, and upcoming schedule pages in one pass.
    for offset in range(start_offset, end_offset + 1):
        date_str = (today + timedelta(days=offset)).strftime("%Y-%m-%d")
        feed_games = feed_map.get(date_str, {})
        if reconcile_schedule_date(date_str, feed_games):
            updated += 1
        map_for_date = build_game_id_map_from_feed(feed, date_str)
        if map_for_date:
            upload_game_id_map(date_str, map_for_date)

    if updated:
        print(f"Reconcile: Updated {updated} schedule file(s).")

def reconcile_schedule_date(date_str, feed_games):
    existing = get_games_from_s3(date_str)
    existing_by_id = {
        str(game.get("id")): game
        for game in existing
        if isinstance(game, dict) and game.get("id")
    }

    merged = []
    for game_id, feed_game in feed_games.items():
        existing_game = existing_by_id.get(str(game_id))
        if existing_game:
            merged_game = {**feed_game, **existing_game}
            if is_cancelled_status(feed_game.get("status")):
                merged_game["status"] = feed_game.get("status")
        else:
            merged_game = feed_game
        merged_game.pop("nbaGameId", None)
        if "time" not in merged_game and merged_game.get("clock"):
            merged_game["time"] = trim_clock_value(merged_game.get("clock"))
        merged_game.pop("clock", None)
        merged_game["date"] = date_str
        merged.append(merged_game)

    merged = normalize_schedule_list(merged)
    existing_norm = normalize_schedule_list(existing)

    if schedules_equal(existing_norm, merged):
        return False

    upload_schedule_s3(
        s3_client=s3_client,
        bucket=BUCKET,
        games_list=merged,
        date_str=date_str,
        prefix=SCHEDULE_PREFIX,
    )
    return True

def fetch_schedule_feed():
    data, _ = fetch_nba_data_urllib(SCHEDULE_FEED_URL, user_agent=random.choice(USER_AGENTS))
    if not data:
        return None
    league = data.get("leagueSchedule", {})
    if not isinstance(league, dict):
        return None
    if not isinstance(league.get("gameDates"), list):
        return None
    return league

def build_schedule_feed_map(league_schedule):
    feed_map = defaultdict(dict)
    for game_date in league_schedule.get("gameDates", []):
        games = game_date.get("games", [])
        if not isinstance(games, list):
            continue
        for game in games:
            if not isinstance(game, dict):
                continue
            game_id = game.get("gameId")
            if not game_id:
                continue
            starttime = extract_feed_starttime(game, game_date)
            date_str = None
            if starttime and "T" in starttime:
                date_str = starttime.split("T")[0]
            if not date_str:
                date_str = extract_feed_date(game_date)
            if not date_str:
                continue
            item = build_schedule_item_from_feed(
                game=game,
                game_id=game_id,
                date_str=date_str,
                starttime=starttime,
            )
            game_key = item.get("id") if isinstance(item, dict) else None
            if not game_key:
                continue
            if "time" not in item and item.get("clock"):
                item["time"] = trim_clock_value(item.get("clock"))
                item.pop("clock", None)
            feed_map[date_str][str(game_key)] = item
    return feed_map

def extract_feed_starttime(game, game_date):
    for key in ("gameDateTimeEst", "gameDateEst"):
        dt = parse_start_time_et(game.get(key))
        if dt:
            return dt.strftime("%Y-%m-%dT%H:%M:%S")
    for key in ("gameDateTimeUTC", "gameDateUTC", "gameTimeUTC"):
        dt = parse_start_time_utc(game.get(key))
        if dt:
            return dt.astimezone(ET_ZONE).strftime("%Y-%m-%dT%H:%M:%S")
    date_str = extract_feed_date(game_date) or extract_feed_date(game)
    if date_str:
        return f"{date_str}T00:00:00"
    return None

def extract_feed_date(payload):
    game_date = None
    if isinstance(payload, dict):
        game_date = payload.get("gameDate")
    if not game_date:
        return None
    for fmt in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(game_date, fmt)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None

def build_schedule_item_from_feed(*, game, game_id, date_str, starttime):
    home = game.get("homeTeam") or {}
    away = game.get("awayTeam") or {}
    status_text = (game.get("gameStatusText") or "").strip()
    if not status_text and game.get("gameStatus") == 1:
        status_text = "Scheduled"

    away_tricode = away.get("teamTricode")
    home_tricode = home.get("teamTricode")
    game_key = build_game_slug(date_str, away_tricode, home_tricode, fallback_id=game_id)

    item = {
        "id": game_key,
        "date": date_str,
        "starttime": starttime,
        "hometeam": home_tricode,
        "awayteam": away_tricode,
        "homescore": home.get("score") or 0,
        "awayscore": away.get("score") or 0,
        "status": status_text,
        "time": trim_clock_value(game.get("gameClock", "") or ""),
        "homerecord": f"{home.get('wins') or 0}-{home.get('losses') or 0}",
        "awayrecord": f"{away.get('wins') or 0}-{away.get('losses') or 0}",
    }

    home_team_id = home.get("teamId") or game.get("homeTeamId")
    away_team_id = away.get("teamId") or game.get("awayTeamId")
    if home_team_id:
        item["homeTeamId"] = home_team_id
    if away_team_id:
        item["awayTeamId"] = away_team_id
    return item

def normalize_team_slug(value):
    if not value:
        return None
    return "".join(ch for ch in str(value).strip().lower() if ch.isalnum()) or None

def build_game_slug(date_str, away_team, home_team, fallback_id=None):
    away = normalize_team_slug(away_team)
    home = normalize_team_slug(home_team)
    if date_str and away and home:
        return f"{date_str}-{away}-{home}"
    if fallback_id is not None:
        return str(fallback_id)
    return None

def trim_clock_value(clock):
    if not clock or not isinstance(clock, str):
        return clock
    trimmed = clock.strip()
    if trimmed.startswith("PT"):
        trimmed = trimmed[2:]
    if trimmed.endswith("S"):
        trimmed = trimmed[:-1]
    if "M" in trimmed:
        trimmed = trimmed.replace("M", "")
    return trimmed

def coerce_nba_game_id(value):
    if value is None:
        return None
    raw = str(value).strip()
    return raw if raw.isdigit() else None

def build_game_id_map_from_feed(league_schedule, date_str):
    if not date_str or not league_schedule:
        return {}
    mapping = {}
    for game_date in league_schedule.get("gameDates", []):
        games = game_date.get("games", [])
        if not isinstance(games, list):
            continue
        for game in games:
            if not isinstance(game, dict):
                continue
            game_id = game.get("gameId")
            if not game_id:
                continue
            starttime = extract_feed_starttime(game, game_date)
            feed_date = None
            if starttime and "T" in starttime:
                feed_date = starttime.split("T")[0]
            if not feed_date:
                feed_date = extract_feed_date(game_date)
            if feed_date != date_str:
                continue
            home = game.get("homeTeam") or {}
            away = game.get("awayTeam") or {}
            game_key = build_game_slug(
                feed_date,
                away.get("teamTricode"),
                home.get("teamTricode"),
                fallback_id=game_id,
            )
            if not game_key:
                continue
            mapping[str(game_key)] = str(game_id)
    return mapping

def load_game_id_map(date_str):
    key = f"{GAME_ID_MAP_PREFIX}{date_str}.json"
    try:
        resp = s3_client.get_object(Bucket=BUCKET, Key=key)
        payload = resp["Body"].read()
        data = json.loads(payload.decode("utf-8"))
        return data if isinstance(data, dict) else {}
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404", "NotFound"):
            return None
        print(f"S3 GameIdMap Error: {e}")
        return None
    except Exception as e:
        print(f"S3 GameIdMap Error: {e}")
        return None

def upload_game_id_map(date_str, mapping):
    if not mapping:
        return
    key = f"{GAME_ID_MAP_PREFIX}{date_str}.json"
    try:
        s3_client.put_object(
            Bucket=BUCKET,
            Key=key,
            Body=json.dumps(mapping),
            ContentType="application/json",
            CacheControl="s-maxage=0, max-age=0, must-revalidate",
        )
        print(f"Uploaded gameId map -> {key} ({len(mapping)} games)")
    except Exception as e:
        print(f"GameIdMap Upload Error: {e}")

def normalize_schedule_list(games):
    cleaned = [g for g in games if isinstance(g, dict)]
    return sorted(
        cleaned,
        key=lambda g: (g.get("starttime") or "", str(g.get("id") or "")),
    )

def schedules_equal(existing, merged):
    return json.dumps(existing, sort_keys=True) == json.dumps(merged, sort_keys=True)

def is_cancelled_status(status_text):
    status = normalize_status(status_text)
    return status.startswith(("postponed", "cancelled", "canceled", "ppd"))

def parse_positive_int(value, fallback):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed >= 0 else fallback

def get_earliest_start_time(games):
    """
    Parses 'starttime' from the schedule payload. 
    Handles the NBA API quirk where EST times are labeled with 'Z'.
    """
    starts = []

    for g in games:
        dt_et = parse_start_time_et(g.get('starttime'))
        if dt_et:
            starts.append(dt_et.astimezone(UTC_ZONE))
        elif g.get('starttime'):
            print(f"Date Parse Error for {g.get('starttime')}")
    return min(starts) if starts else None
