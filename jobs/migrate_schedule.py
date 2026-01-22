import boto3
import json
import gzip
from collections import defaultdict
from decimal import Decimal
import datetime

# --- CONFIGURATION ---
TABLE_NAME = "NBA_Games"
BUCKET_NAME = "roryeagan.com-nba-processed-data"
S3_FOLDER = "schedule"

# Set to True to only process specific dates
TEST_MODE = False 
# Add the specific dates you want to test here (YYYY-MM-DD)
TEST_DATES = ["2024-01-31", "2026-01-07"] 
# ---------------------

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

def migrate_data():
    print(f"Starting migration ({'TEST MODE' if TEST_MODE else 'FULL MIGRATION'})...")
    
    dynamodb = boto3.resource('dynamodb')
    s3 = boto3.client('s3')
    table = dynamodb.Table(TABLE_NAME)

    # Scan Table
    response = table.scan()
    items = response['Items']
    
    # Handle pagination if necessary
    while 'LastEvaluatedKey' in response:
        print("Scanning more items...")
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response['Items'])

    print(f"Total games found in DB: {len(items)}")

    # Group by Date
    games_by_date = defaultdict(list)
    for item in items:
        date = item.get('date')
        if not date: continue

        # If in TEST_MODE, skip dates that aren't in our list
        if TEST_MODE and date not in TEST_DATES:
            continue

        game_obj = {
            "id": item.get('id'),
            "homescore": item.get('homescore', 0),
            "awayscore": item.get('awayscore', 0),
            "hometeam": item.get('hometeam'),
            "awayteam": item.get('awayteam'),
            "starttime": item.get('starttime'),
            "time": item.get('time') or item.get('clock'),
            "status": item.get('status'),
            "date": date
        }
        games_by_date[date].append(game_obj)

    # Upload Compressed JSONs
    print(f"Ready to upload {len(games_by_date)} files to S3...")
    
    for date_str, games in games_by_date.items():
        games.sort(key=lambda x: x.get('starttime', ''))

        key = f"{S3_FOLDER}/{date_str}.json.gz"
        
        # Serialize & Compress
        json_str = json.dumps(games, cls=DecimalEncoder)
        compressed_body = gzip.compress(json_str.encode('utf-8'))
        
        # Cache Logic
        try:
            game_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
            today = datetime.date.today()
            if game_date < today:
                cache_control = "max-age=31536000, immutable"
            else:
                cache_control = "max-age=60" 
        except ValueError:
            cache_control = "max-age=60"

        # Upload
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=key,
            Body=compressed_body,
            ContentType='application/json',
            ContentEncoding='gzip',
            CacheControl=cache_control
        )
        print(f"SUCCESS: Uploaded {key} with {len(games)} games (Cache: {cache_control})")

    print("\nTest complete! Check the files in S3.")

if __name__ == "__main__":
    migrate_data()
