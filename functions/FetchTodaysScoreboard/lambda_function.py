import os
import json
import gzip
import urllib.request
import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get('AWS_REGION', 'us-east-1')
BUCKET = os.environ['DATA_BUCKET']
SCHEDULE_PREFIX = os.environ.get('SCHEDULE_PREFIX', 'schedule/')
if SCHEDULE_PREFIX and not SCHEDULE_PREFIX.endswith('/'):
    SCHEDULE_PREFIX += '/'
GAME_ID_MAP_PREFIX = os.environ.get('GAME_ID_MAP_PREFIX', 'private/gameIdMap/')
if GAME_ID_MAP_PREFIX and not GAME_ID_MAP_PREFIX.endswith('/'):
    GAME_ID_MAP_PREFIX += '/'

SCOREBOARD_URL = "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json"

# Initialize S3 client outside the handler for connection reuse
s3_client = boto3.client('s3', region_name=REGION)

def handler(event, context):
    try:
        req = urllib.request.Request(SCOREBOARD_URL)
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                raise Exception(f"HTTP error: {response.status}")
            data = json.loads(response.read().decode('utf-8'))

        games = data.get('scoreboard', {}).get('games', [])

        if not isinstance(games, list):
            print("No games array in JSON")
            return

        games_by_date = {}
        game_id_maps = {}

        for game in games:
            game_et = game.get('gameEt')
            game_id = game.get('gameId')
            if not game_et or not game_id or 'T' not in game_et:
                print(f"Skipping game with missing id/date: {game_id}")
                continue

            game_date = game_et.split('T')[0]
            home = game.get('homeTeam', {}) or {}
            away = game.get('awayTeam', {}) or {}
            away_tricode = away.get('teamTricode')
            home_tricode = home.get('teamTricode')
            game_key = build_game_slug(game_date, away_tricode, home_tricode, fallback_id=game_id)
            game_id_maps.setdefault(game_date, {})[game_key] = str(game_id)

            item = {
                'date': game_date,
                'id': game_key,
                'homescore': home.get('score') or 0,
                'awayscore': away.get('score') or 0,
                'hometeam': home_tricode,
                'awayteam': away_tricode,
                'starttime': game_et,
                'time': trim_clock_value(game.get('gameClock', '') or ''),
                'status': game.get('gameStatusText', '') or '',
                'homerecord': f"{home.get('wins') or 0}-{home.get('losses') or 0}",
                'awayrecord': f"{away.get('wins') or 0}-{away.get('losses') or 0}",
            }

            home_team_id = home.get('teamId') or game.get('homeTeamId')
            away_team_id = away.get('teamId') or game.get('awayTeamId')
            if home_team_id:
                item['homeTeamId'] = home_team_id
            if away_team_id:
                item['awayTeamId'] = away_team_id

            games_by_date.setdefault(game_date, []).append(item)

        if not games_by_date:
            print("No valid games found in scoreboard payload")
            return

        for date_str, date_games in games_by_date.items():
            existing_games = load_existing_schedule(date_str)
            merged_games = merge_schedule_lists(existing_games, date_games)
            merged_games.sort(key=lambda x: x.get('starttime', ''))
            upload_schedule(date_str, merged_games)

            existing_map = load_existing_game_id_map(date_str)
            merged_map = {**existing_map, **(game_id_maps.get(date_str) or {})}
            if merged_map:
                upload_game_id_map(date_str, merged_map)

        print(f"Uploaded {sum(len(g) for g in games_by_date.values())} games to S3")

    except Exception as e:
        print(f"Error: {str(e)}")
        raise e


def upload_schedule(date_str, games):
    payload = json.dumps(games).encode('utf-8')
    compressed = gzip.compress(payload)
    key = f"{SCHEDULE_PREFIX}{date_str}.json.gz"

    s3_client.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=compressed,
        ContentType='application/json',
        ContentEncoding='gzip',
        CacheControl='s-maxage=0, max-age=0, must-revalidate',
    )
    print(f"Uploaded schedule -> {key} ({len(games)} games)")

def upload_game_id_map(date_str, mapping):
    payload = json.dumps(mapping).encode('utf-8')
    key = f"{GAME_ID_MAP_PREFIX}{date_str}.json"
    s3_client.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=payload,
        ContentType='application/json',
        CacheControl='s-maxage=0, max-age=0, must-revalidate',
    )
    print(f"Uploaded gameId map -> {key} ({len(mapping)} games)")

def load_existing_schedule(date_str):
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

def load_existing_game_id_map(date_str):
    key = f"{GAME_ID_MAP_PREFIX}{date_str}.json"
    try:
        resp = s3_client.get_object(Bucket=BUCKET, Key=key)
        payload = resp["Body"].read()
        data = json.loads(payload.decode("utf-8"))
        return data if isinstance(data, dict) else {}
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404", "NotFound"):
            return {}
        print(f"S3 GameIdMap Error: {e}")
        return {}
    except Exception as e:
        print(f"S3 GameIdMap Error: {e}")
        return {}

def merge_schedule_lists(existing, incoming):
    merged = {}
    for game in existing or []:
        game_id = game.get("id") if isinstance(game, dict) else None
        if game_id:
            merged[str(game_id)] = game
    for game in incoming or []:
        if not isinstance(game, dict):
            continue
        game_id = game.get("id")
        if not game_id:
            continue
        existing_game = merged.get(str(game_id))
        if existing_game:
            merged[str(game_id)] = merge_game(existing_game, game)
        else:
            merged[str(game_id)] = game
    return list(merged.values())

def merge_game(existing, incoming):
    merged = dict(existing) if isinstance(existing, dict) else {}
    for key, value in (incoming or {}).items():
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        merged[key] = value
    return merged

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
