import os
import json
import gzip
import urllib.request
import boto3

REGION = os.environ.get('AWS_REGION', 'us-east-1')
BUCKET = os.environ['DATA_BUCKET']
SCHEDULE_PREFIX = os.environ.get('SCHEDULE_PREFIX', 'schedule/')
if SCHEDULE_PREFIX and not SCHEDULE_PREFIX.endswith('/'):
    SCHEDULE_PREFIX += '/'

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

        for game in games:
            game_et = game.get('gameEt')
            game_id = game.get('gameId')
            if not game_et or not game_id or 'T' not in game_et:
                print(f"Skipping game with missing id/date: {game_id}")
                continue

            game_date = game_et.split('T')[0]
            home = game.get('homeTeam', {}) or {}
            away = game.get('awayTeam', {}) or {}

            item = {
                'date': game_date,
                'id': game_id,
                'homescore': home.get('score') or 0,
                'awayscore': away.get('score') or 0,
                'hometeam': home.get('teamTricode'),
                'awayteam': away.get('teamTricode'),
                'starttime': game_et,
                'clock': game.get('gameClock', '') or '',
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
            date_games.sort(key=lambda x: x.get('starttime', ''))
            upload_schedule(date_str, date_games)

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
