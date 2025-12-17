import json
import gzip
import boto3
import os
import urllib.request
import urllib.error
import random
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

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

# --- User Agents List ---
USER_AGENTS = [
    # Chrome on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    # Chrome on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    # Firefox on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    # Safari on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    # Edge on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
]

# AWS Clients
s3_client = boto3.client('s3', region_name=REGION)
ddb = boto3.resource('dynamodb', region_name=REGION)
table = ddb.Table(DDB_TABLE)
events_client = boto3.client('events', region_name=REGION)
scheduler_client = boto3.client('scheduler', region_name=REGION)

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

    # --- SECURITY: Pick ONE identity for this entire session ---
    session_user_agent = random.choice(USER_AGENTS)

    # --- RANDOMIZATION: Shuffle processing order ---
    random.shuffle(games)

    active_count = 0
    updates_made = 0
    
    total_games_to_process = len(games)

    for i, game in enumerate(games):
        game_id = game['id']
        
        # Skip if already marked Final in our DB
        if game.get('status', '').startswith('Final'):
            continue

        active_count += 1
        try:
            # Pass the SESSION user agent down
            is_final = process_game(game, user_agent=session_user_agent)
            
            if is_final:
                print(f"Poller: Game {game_id} went Final.")
                update_manifest(game_id)
                updates_made += 1
            
            # --- DYNAMIC SLEEP LOGIC ---
            # We skip sleep after the very last game
            if i < total_games_to_process - 1:
                sleep_duration = calculate_safe_sleep(context, i, total_games_to_process)
                if sleep_duration > 0:
                    time.sleep(sleep_duration)

        except Exception as e:
            print(f"Poller Error on game {game_id}: {e}")

    if active_count == 0:
        disable_self()

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

    # --- 1. Play by Play ---
    if play_data:
        actions = play_data.get('game', {}).get('actions', [])
        if actions:
            # Check if last action is "Game End"
            last_desc = actions[-1].get('description', '').strip()
            is_play_final = last_desc.startswith('Game End')
            
            upload_json_to_s3(f"playByPlayData/{game_id}.json", actions, is_final=is_play_final)
            updates['play_etag'] = play_etag

    # --- 2. Box Score ---
    if box_data:
        box_game = box_data.get('game', {})
        status_text = box_game.get('gameStatusText', '').strip()
        is_game_final = status_text.startswith('Final')

        upload_json_to_s3(f"boxData/{game_id}.json", box_game, is_final=is_game_final)
        
        # Prepare DDB fields
        updates.update({
            'box_etag': box_etag,
            'status': status_text,
            'clock': box_game.get('gameClock', ''),
            'homescore': box_game.get('homeTeam', {}).get('score', 0),
            'awayscore': box_game.get('awayTeam', {}).get('score', 0),
            'homerecord': f"{box_game.get('homeTeam', {}).get('wins','0')}-{box_game.get('homeTeam', {}).get('losses','0')}",
            'awayrecord': f"{box_game.get('awayTeam', {}).get('wins','0')}-{box_game.get('awayTeam', {}).get('losses','0')}"
        })

    # --- 3. Update DB ---
    if updates:
        update_ddb_game(game_id, game_item['date'], updates)

    return is_game_final

# ==============================================================================
# HELPERS
# ==============================================================================
def fetch_nba_data_urllib(url, etag=None, user_agent=None):
    """
    Fetches JSON using standard library with Randomized User-Agents.
    """
    # Fallback if no agent passed
    if not user_agent:
        user_agent = random.choice(USER_AGENTS)
    
    req = urllib.request.Request(url)
    req.add_header('User-Agent', user_agent)
    req.add_header('Accept', 'application/json, text/plain, */*')
    req.add_header('Accept-Language', 'en-US,en;q=0.9')
    req.add_header('Referer', 'https://www.nba.com/')
    req.add_header('Origin', 'https://www.nba.com')
    req.add_header('Connection', 'keep-alive')
    req.add_header('Accept-Encoding', 'gzip, deflate')

    if etag:
        req.add_header('If-None-Match', etag)
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                content = response.read()
                
                # Decompress if Gzipped
                if content.startswith(b'\x1f\x8b'):
                    try:
                        content = gzip.decompress(content)
                    except OSError:
                        pass
                
                try:
                    data = json.loads(content)
                    new_etag = response.getheader('ETag')
                    return data, new_etag
                except json.JSONDecodeError:
                    print(f"JSON Decode Error for {url}")
                    return None, etag
            
            return None, etag

    except urllib.error.HTTPError as e:
        if e.code == 304:
            return None, etag
        else:
            print(f"Network Error {url}: {e.code} {e.reason}")
            return None, etag
    except Exception as e:
        print(f"Network Exception {url}: {e}")
        return None, etag

def upload_json_to_s3(key, data, is_final=False):
    json_str = json.dumps(data)
    compressed = gzip.compress(json_str.encode('utf-8'))
    
    # 1 week cache if final, otherwise 0
    cache_control = "public, max-age=604800" if is_final else "s-maxage=0, max-age=0, must-revalidate"
    full_key = f"{PREFIX}{key}.gz"

    s3_client.put_object(
        Bucket=BUCKET,
        Key=full_key,
        Body=compressed,
        ContentType='application/json',
        ContentEncoding='gzip',
        CacheControl=cache_control
    )
    print(f"Uploaded S3: {full_key}")

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

def update_manifest(game_id):
    """Loads manifest.json from S3, adds game_id, uploads it back."""
    try:
        # Load
        try:
            resp = s3_client.get_object(Bucket=BUCKET, Key=MANIFEST_KEY)
            content = resp['Body'].read().decode('utf-8')
            manifest = set(json.loads(content))
        except ClientError:
            manifest = set()

        if game_id in manifest:
            return # No change needed

        manifest.add(game_id)
        
        # Save
        s3_client.put_object(
            Bucket=BUCKET,
            Key=MANIFEST_KEY,
            Body=json.dumps(list(manifest)),
            ContentType='application/json'
        )
        print(f"Manifest updated with {game_id}")
    except Exception as e:
        print(f"Manifest Error: {e}")

def get_nba_date():
    """
    Returns today's date in 'YYYY-MM-DD' format, adjusted for NBA "day"
    (where games finishing at 1AM count for the previous calendar day).
    """
    # Using ZoneInfo for accuracy
    now_et = datetime.now(ZoneInfo("America/New_York"))
    # If it's before 4 AM, count it as "yesterday" (for late night games)
    if now_et.hour < 4:
        now_et = now_et - timedelta(days=1)
    return now_et.strftime('%Y-%m-%d')

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
    
    # Define Timezones
    et_zone = ZoneInfo("America/New_York")
    utc_zone = ZoneInfo("UTC")

    for g in games:
        ts = g.get('starttime') # e.g., "2025-12-16T20:30:00Z"
        if ts:
            try:
                # 1. Remove the Z so we can treat it as naive
                ts_clean = ts.replace('Z', '')
                
                # 2. Parse as naive datetime
                dt_naive = datetime.fromisoformat(ts_clean)
                
                # 3. FORCE it to be Eastern Time (Fixing the NBA Data error)
                dt_et = dt_naive.replace(tzinfo=et_zone)
                
                # 4. Convert to UTC for the Scheduler
                dt_utc = dt_et.astimezone(utc_zone)
                
                starts.append(dt_utc)
            except ValueError:
                print(f"Date Parse Error for {ts}")
                pass
    return min(starts) if starts else None