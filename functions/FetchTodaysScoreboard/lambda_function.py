import os
import json
import urllib.request
import boto3
from botocore.exceptions import ClientError

# Initialize DynamoDB resource outside the handler for connection reuse
dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('GAMES_TABLE')

def handler(event, context):
    try:
        # Fetch Scoreboard Data
        url = "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                raise Exception(f"HTTP error: {response.status}")
            # Read and parse JSON
            data = json.loads(response.read().decode('utf-8'))

        games = data.get('scoreboard', {}).get('games', [])
        
        if not isinstance(games, list):
            print("No games array in JSON")
            return

        table = dynamodb.Table(TABLE_NAME)

        # Batch write to DynamoDB
        with table.batch_writer() as batch:
            for game in games:
                game_date = game.get('gameEt', '').split('T')[0]
                
                # Construct the item
                item = {
                    'PK': f"GAME#{game.get('gameId')}",
                    'SK': f"DATE#{game_date}",
                    'date': game_date,
                    'id': game.get('gameId'),
                    'homescore': game.get('homeTeam', {}).get('score'),
                    'awayscore': game.get('awayTeam', {}).get('score'),
                    'hometeam': game.get('homeTeam', {}).get('teamTricode'),
                    'awayteam': game.get('awayTeam', {}).get('teamTricode'),
                    'starttime': game.get('gameEt'),
                    'clock': game.get('gameClock'),
                    'status': game.get('gameStatusText'),
                    'homerecord': f"{game.get('homeTeam', {}).get('wins')}-{game.get('homeTeam', {}).get('losses')}",
                    'awayrecord': f"{game.get('awayTeam', {}).get('wins')}-{game.get('awayTeam', {}).get('losses')}"
                }
                
                # Add to batch
                batch.put_item(Item=item)

        print(f"Wrote {len(games)} games into {TABLE_NAME}")

    except Exception as e:
        print(f"Error: {str(e)}")
        raise e