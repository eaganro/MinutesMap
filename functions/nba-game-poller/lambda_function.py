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
from nba_game_poller.playbyplay_processing import infer_team_ids_from_actions, process_playbyplay_payload
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
SCHEDULE_PREFIX = 'schedule/'
GAMEPACK_PREFIX = 'gamepack/'
GAME_ID_MAP_PREFIX = os.environ.get("GAME_ID_MAP_PREFIX", "private/gameIdMap/")
if GAME_ID_MAP_PREFIX and not GAME_ID_MAP_PREFIX.endswith('/'):
    GAME_ID_MAP_PREFIX += '/'
SCHEDULE_FEED_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json"
SCHEDULE_RECONCILE_DAYS = os.environ.get("SCHEDULE_RECONCILE_DAYS", "3")

# 3. Security (From Terraform)
LAMBDA_ARN = os.environ.get('LAMBDA_ARN')
SCHEDULER_ROLE_ARN = os.environ.get('SCHEDULER_ROLE_ARN')

# AWS Clients
s3_client = boto3.client('s3', region_name=REGION)
events_client = boto3.client('events', region_name=REGION)
scheduler_client = boto3.client('scheduler', region_name=REGION)

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
    else:
        return poller_logic(context)

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

def schedule_kickoff(run_at_dt):
    at_expression = f"at({run_at_dt.strftime('%Y-%m-%dT%H:%M:%S')})"

    try:
        # Cleanup old schedule if exists
        try:
            scheduler_client.delete_schedule(Name=KICKOFF_SCHEDULE_NAME)
        except ClientError:
            pass 

        scheduler_client.create_schedule(
            Name=KICKOFF_SCHEDULE_NAME,
            ScheduleExpression=at_expression,
            Target={
                'Arn': LAMBDA_ARN,
                'RoleArn': SCHEDULER_ROLE_ARN,
                'Input': json.dumps({'task': 'enable_poller'})
            },
            FlexibleTimeWindow={'Mode': 'OFF'}
        )
        print(f"Manager: Created one-time schedule '{KICKOFF_SCHEDULE_NAME}' at {at_expression}")
    except Exception as e:
        print(f"Manager Error: Failed to schedule kickoff: {e}")
        # Fallback: enable immediately so we don't miss games
        enable_poller_logic()

# ==============================================================================
# 2. KICKOFF LOGIC (One-Time Trigger)
# ==============================================================================
def enable_poller_logic():
    print("Kickoff: Reconciling schedule before enabling poller...")
    try:
        reconcile_recent_schedule()
    except Exception as e:
        print(f"Kickoff: Reconcile failed, continuing anyway: {e}")
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
def poller_logic(context):
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
        status_text = (game.get('status') or '').strip()
        if is_terminal_status(status_text):
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

    # --- SECURITY: Pick ONE identity for this entire session ---
    session_user_agent = random.choice(USER_AGENTS)

    # --- RANDOMIZATION: Shuffle processing order ---
    random.shuffle(active_games)

    total_games_to_process = len(active_games)
    schedule_dirty = False

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
                sleep_duration = calculate_safe_sleep(context, i, total_games_to_process)
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

def calculate_safe_sleep(context, current_index, total_items):
    """
    Calculates a sleep time that fits within the remaining Lambda execution window.
    """
    # Desired "Polite" range
    MIN_SLEEP = 1.0
    MAX_SLEEP = 3.0
    
    # If no context (local testing), just return random normal
    if not context or not hasattr(context, 'get_remaining_time_in_millis'):
        return random.uniform(MIN_SLEEP, MAX_SLEEP)

    # 1. Get remaining time in seconds
    remaining_ms = context.get_remaining_time_in_millis()
    remaining_sec = remaining_ms / 1000.0

    # 2. Reserve a safety buffer (5 seconds for teardown/overhead)
    SAFETY_BUFFER = 5.0
    
    # 3. Estimate time needed for FUTURE network calls
    # We estimate 1.5s per remaining game to process (network IO)
    items_remaining = total_items - 1 - current_index
    estimated_work_sec = items_remaining * 1.5

    # 4. Calculate Budget
    time_budget_for_sleep = remaining_sec - estimated_work_sec - SAFETY_BUFFER
    
    # If we are negative, we are already late. Don't sleep.
    if time_budget_for_sleep <= 0:
        return 0.0

    # 5. Distribute budget across remaining gaps
    if items_remaining < 1: 
        return 0.0

    max_allowable_sleep = time_budget_for_sleep / items_remaining

    # 6. Cap it at our polite max, but shrink if needed
    actual_upper_limit = min(MAX_SLEEP, max_allowable_sleep)
    
    # If the budget is super tight (e.g. < 0.2s), just skip sleeping
    if actual_upper_limit < 0.2:
        return 0.0
    
    # 7. Return random jitter
    # Ensure lower bound isn't higher than upper bound
    actual_lower_limit = min(MIN_SLEEP, actual_upper_limit)
    
    return random.uniform(actual_lower_limit, actual_upper_limit)

def disable_self():
    try:
        events_client.disable_rule(Name=POLLER_RULE_NAME)
        print(f"Poller: Successfully disabled {POLLER_RULE_NAME}")
    except Exception as e:
        print(f"Poller Error: Failed to disable rule: {e}")

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

    # 304 Optimization: If neither changed, exit early
    if play_data is None and box_data is None:
        return False, {}

    updates = {}
    is_game_final = False
    is_play_final = False
    processed = None
    slim_box = None

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

    # --- 1. Play by Play ---
    if play_data:
        actions = play_data.get('game', {}).get('actions', [])
        if actions:
            # Check if last action is "Game End"
            last_desc = actions[-1].get('description', '').strip()
            is_play_final = last_desc.startswith('Game End')

            # Build slim processed payload for the compact gamepack.
            if not (home_team_id and away_team_id):
                inferred_away, inferred_home = infer_team_ids_from_actions(actions)
                away_team_id = away_team_id or inferred_away
                home_team_id = home_team_id or inferred_home

            if home_team_id and away_team_id:
                processed = process_playbyplay_payload(
                    game_id=nba_game_id,
                    actions=actions,
                    away_team_id=away_team_id,
                    home_team_id=home_team_id,
                    include_actions=False,
                    include_all_actions=False,
                )

            updates['play_etag'] = play_etag

    # --- 2. Box Score ---
    if box_data:
        status_text = box_game.get('gameStatusText', '').strip()
        is_game_final = status_text.startswith('Final')

        slim_box = build_box_payload(nba_game_id, box_game)

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

    if processed is not None or slim_box is not None:
        if processed is None or slim_box is None:
            existing = load_gamepack(game_key)
            if processed is None:
                processed = (existing or {}).get("flow")
            if slim_box is None:
                slim_box = (existing or {}).get("box")

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
                is_final=is_game_final or is_play_final,
            )
        else:
            print(f"Poller: Skipping gamepack upload for {game_key}, missing data.")

    return is_game_final, updates


def load_gamepack(game_key):
    key = f"{PREFIX}{GAMEPACK_PREFIX}{game_key}.json.gz"
    try:
        resp = s3_client.get_object(Bucket=BUCKET, Key=key)
        body = resp["Body"].read()
        if body.startswith(b"\x1f\x8b"):
            body = gzip.decompress(body)
        return json.loads(body)
    except Exception as e:
        print(f"Poller: Failed to load gamepack {game_key}: {e}")
        return None


def build_box_payload(game_id, box_game):
    if not isinstance(box_game, dict):
        return None
    return {
        "start": (
            box_game.get("gameEt")
            or box_game.get("gameTimeUTC")
            or box_game.get("gameDateTimeUTC")
        ),
        "teams": {
            "away": build_team_payload(box_game.get("awayTeam")),
            "home": build_team_payload(box_game.get("homeTeam")),
        },
    }

def build_team_payload(team):
    if not isinstance(team, dict):
        return None
    players = []
    for player in team.get("players") or []:
        if not isinstance(player, dict):
            continue
        stats = player.get("statistics") or {}
        players.append({
            "first": (player.get("firstName") or "").strip(),
            "last": (player.get("familyName") or "").strip(),
            "stats": {
                "min": normalize_minutes(stats.get("minutes")),
                "pts": safe_int(stats.get("points")),
                "fgm": safe_int(stats.get("fieldGoalsMade")),
                "fga": safe_int(stats.get("fieldGoalsAttempted")),
                "tpm": safe_int(stats.get("threePointersMade")),
                "tpa": safe_int(stats.get("threePointersAttempted")),
                "ftm": safe_int(stats.get("freeThrowsMade")),
                "fta": safe_int(stats.get("freeThrowsAttempted")),
                "oreb": safe_int(stats.get("reboundsOffensive")),
                "dreb": safe_int(stats.get("reboundsDefensive")),
                "ast": safe_int(stats.get("assists")),
                "stl": safe_int(stats.get("steals")),
                "blk": safe_int(stats.get("blocks")),
                "to": safe_int(stats.get("turnovers")),
                "pf": safe_int(stats.get("foulsPersonal")),
                "pm": safe_int(stats.get("plusMinusPoints")),
            },
        })
    return {
        "id": team.get("teamId"),
        "abbr": team.get("teamTricode"),
        "name": team.get("teamName"),
        "players": players,
    }

def normalize_minutes(raw_minutes):
    if not raw_minutes:
        return "00:00"
    if isinstance(raw_minutes, str):
        minutes = raw_minutes.strip()
        if minutes.startswith("PT") and minutes.endswith("S"):
            stripped = minutes[2:-1]
            if "M" in stripped:
                mins_part, sec_part = stripped.split("M", 1)
                mins = safe_int(mins_part)
                secs = int(float(sec_part)) if sec_part else 0
            else:
                mins = 0
                secs = int(float(stripped)) if stripped else 0
            return f"{mins:02d}:{secs:02d}"
        if ":" in minutes:
            return minutes
    return "00:00"

def safe_int(value):
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return 0

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
    days = parse_positive_int(SCHEDULE_RECONCILE_DAYS, 3)
    if days <= 0:
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

    for offset in range(days):
        date_str = (today - timedelta(days=offset)).strftime("%Y-%m-%d")
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
