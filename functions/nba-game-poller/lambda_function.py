import json
import boto3
import os
import random
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from nba_game_poller.nba_api import USER_AGENTS, fetch_nba_data_urllib
from nba_game_poller.playbyplay_processing import infer_team_ids_from_actions, process_playbyplay_payload
from nba_game_poller.storage import upload_json_to_s3, update_manifest as storage_update_manifest

# --- Configuration & Environment ---
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# 1. Dynamic Resources (From Terraform)
BUCKET = os.environ['DATA_BUCKET']
DDB_TABLE = os.environ['DDB_TABLE']
POLLER_RULE_NAME = os.environ['POLLER_RULE_NAME']

# 2. Optional / Defaults
DDB_GSI = os.environ.get('DDB_GSI', 'ByDate')
PREFIX = 'data/'
MANIFEST_KEY = f'{PREFIX}manifest.json'
KICKOFF_SCHEDULE_NAME = 'NBA_Daily_Kickoff'

# 3. Security (From Terraform)
LAMBDA_ARN = os.environ.get('LAMBDA_ARN')
SCHEDULER_ROLE_ARN = os.environ.get('SCHEDULER_ROLE_ARN')

# AWS Clients
s3_client = boto3.client('s3', region_name=REGION)
ddb = boto3.resource('dynamodb', region_name=REGION)
table = ddb.Table(DDB_TABLE)
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
    today_str = get_nba_date()
    print(f"Manager: Checking games for {today_str}...")

    games = get_games_from_ddb(today_str)
    
    if not games:
        print("Manager: No games found in DynamoDB for today.")
        return

    start_dt = get_earliest_start_time(games)
    
    if not start_dt:
        print("Manager: Games exist but have no valid start time. Enabling immediately.")
        return enable_poller_logic()

    # Schedule kickoff 15 minutes before the first tip-off
    kickoff_time = start_dt - timedelta(minutes=15)
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
    games = get_games_from_ddb(today_str)

    if not games:
        print("Poller: No games found for today. Disabling self.")
        disable_self()
        return

    now_et = datetime.now(ET_ZONE)

    active_games = []
    remaining_games = 0

    for game in games:
        status_text = (game.get('status') or '').strip()
        if is_terminal_status(status_text):
            continue
        remaining_games += 1
        if has_game_started(game, now_et):
            active_games.append(game)

    if remaining_games == 0:
        print("Poller: All games are final or inactive. Disabling self.")
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

    for i, game in enumerate(active_games):
        game_id = game['id']
        
        try:
            # Pass the SESSION user agent down
            is_final = process_game(game, user_agent=session_user_agent)
            
            if is_final:
                print(f"Poller: Game {game_id} went Final.")
                storage_update_manifest(
                    s3_client=s3_client,
                    bucket=BUCKET,
                    manifest_key=MANIFEST_KEY,
                    game_id=game_id,
                )
            
            # --- DYNAMIC SLEEP LOGIC ---
            # We skip sleep after the very last game
            if i < total_games_to_process - 1:
                sleep_duration = calculate_safe_sleep(context, i, total_games_to_process)
                if sleep_duration > 0:
                    time.sleep(sleep_duration)

        except Exception as e:
            print(f"Poller Error on game {game_id}: {e}")

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
def process_game(game_item, user_agent=None):
    game_id = game_item['id']
    
    # Get stored ETags
    last_play_etag = game_item.get('play_etag')
    last_box_etag = game_item.get('box_etag')

    urls = {
        'play': f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{game_id}.json",
        'box': f"https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{game_id}.json"
    }

    # Fetch Data
    play_data, play_etag = fetch_nba_data_urllib(urls['play'], last_play_etag, user_agent)
    box_data, box_etag = fetch_nba_data_urllib(urls['box'], last_box_etag, user_agent)

    # 304 Optimization: If neither changed, exit early
    if play_data is None and box_data is None:
        return False

    updates = {}
    is_game_final = False

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

            # 1) Upload raw actions to the original location (backwards-compatible).
            upload_json_to_s3(
                s3_client=s3_client,
                bucket=BUCKET,
                prefix=PREFIX,
                key=f"playByPlayData/{game_id}.json",
                data=actions,
                is_final=is_play_final,
            )

            # 2) Upload slim processed payload to the new processed-data location.
            if not (home_team_id and away_team_id):
                inferred_away, inferred_home = infer_team_ids_from_actions(actions)
                away_team_id = away_team_id or inferred_away
                home_team_id = home_team_id or inferred_home

            if home_team_id and away_team_id:
                processed = process_playbyplay_payload(
                    game_id=game_id,
                    actions=actions,
                    away_team_id=away_team_id,
                    home_team_id=home_team_id,
                    include_actions=False,
                    include_all_actions=False,
                )
                upload_json_to_s3(
                    s3_client=s3_client,
                    bucket=BUCKET,
                    prefix=PREFIX,
                    key=f"processed-data/playByPlayData/{game_id}.json",
                    data=processed,
                    is_final=is_play_final,
                )

            updates['play_etag'] = play_etag

    # --- 2. Box Score ---
    if box_data:
        status_text = box_game.get('gameStatusText', '').strip()
        is_game_final = status_text.startswith('Final')

        upload_json_to_s3(
            s3_client=s3_client,
            bucket=BUCKET,
            prefix=PREFIX,
            key=f"boxData/{game_id}.json",
            data=box_game,
            is_final=is_game_final,
        )

        # Cache stable IDs so play-by-play processing can run even if boxscore is a 304 later.
        home_team_id = box_game.get("homeTeam", {}).get("teamId") or box_game.get("homeTeamId")
        away_team_id = box_game.get("awayTeam", {}).get("teamId") or box_game.get("awayTeamId")
        
        # Prepare DDB fields
        updates.update({
            'box_etag': box_etag,
            'status': status_text,
            'clock': box_game.get('gameClock', ''),
            'homescore': box_game.get('homeTeam', {}).get('score', 0),
            'awayscore': box_game.get('awayTeam', {}).get('score', 0),
            'homerecord': f"{box_game.get('homeTeam', {}).get('wins','0')}-{box_game.get('homeTeam', {}).get('losses','0')}",
            'awayrecord': f"{box_game.get('awayTeam', {}).get('wins','0')}-{box_game.get('awayTeam', {}).get('losses','0')}",
            'homeTeamId': home_team_id,
            'awayTeamId': away_team_id,
        })

    # --- 3. Update DB ---
    if updates:
        update_ddb_game(game_id, game_item['date'], updates)

    return is_game_final

def update_ddb_game(game_id, date_str, updates):
    exp_parts = []
    exp_names = {}
    exp_values = {}

    for k, v in updates.items():
        attr_name = f"#{k}"
        attr_val = f":{k}"
        exp_parts.append(f"{attr_name} = {attr_val}")
        exp_names[attr_name] = k
        exp_values[attr_val] = v

    try:
        table.update_item(
            Key={'PK': f"GAME#{game_id}", 'SK': f"DATE#{date_str}"},
            UpdateExpression="SET " + ", ".join(exp_parts),
            ExpressionAttributeNames=exp_names,
            ExpressionAttributeValues=exp_values
        )
    except ClientError as e:
        print(f"DDB Update Error {game_id}: {e}")

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
    if game.get('clock'):
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

def has_game_started(game, now_et):
    if status_indicates_live(game):
        return True
    start_et = parse_start_time_et(game.get('starttime'))
    if not start_et:
        return False
    return now_et >= start_et

def get_games_from_ddb(date_str):
    try:
        resp = table.query(
            IndexName=DDB_GSI,
            KeyConditionExpression=Key('date').eq(date_str)
        )
        return resp.get('Items', [])
    except ClientError as e:
        print(f"DDB Query Error: {e}")
        return []

def get_earliest_start_time(games):
    """
    Parses 'starttime' from DynamoDB. 
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
