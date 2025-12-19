import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from decimal import Decimal

# Initialize Clients
dynamodb = boto3.resource('dynamodb')

# Constants from Env Vars
GAMES_TABLE_NAME = os.environ.get('GAMES_TABLE', 'NBA_Games')
GAMES_GSI = os.environ.get('GAMES_GSI', 'ByDate')
DATE_CONN_TABLE_NAME = os.environ.get('DATE_CONN_TABLE', 'DateConnections')
DATE_INDEX_NAME = os.environ.get('DATE_INDEX_NAME', 'date-index')
WS_API_ENDPOINT = os.environ.get('WS_API_ENDPOINT')

# API Gateway Client
apigw_client = boto3.client('apigatewaymanagementapi', endpoint_url=WS_API_ENDPOINT)

def handler(event, context):
    # Collect distinct dates from the Stream batch
    dates = set()
    for record in event.get('Records', []):
        if record['eventName'] in ['INSERT', 'MODIFY']:
            # DynamoDB Stream uses 'NewImage' with type descriptors (e.g. {'S': '2025-01-01'})
            try:
                date_val = record['dynamodb']['NewImage']['date']['S']
                dates.add(date_val)
            except (KeyError, TypeError):
                continue

    # Process each unique date
    for date_str in dates:
        process_date_update(date_str)

def process_date_update(date_str):
    # Fetch all subscribers for this date (Query DateConnections GSI)
    conn_table = dynamodb.Table(DATE_CONN_TABLE_NAME)
    try:
        sub_resp = conn_table.query(
            IndexName=DATE_INDEX_NAME,
            KeyConditionExpression=Key('dateString').eq(date_str)
        )
    except ClientError as e:
        print(f"Error querying subscribers: {e}")
        return

    connections = [item['connectionId'] for item in sub_resp.get('Items', [])]
    
    if not connections:
        return

    # Fetch all games for this date (Query NBA_Games GSI)
    games_table = dynamodb.Table(GAMES_TABLE_NAME)
    try:
        games_resp = games_table.query(
            IndexName=GAMES_GSI,
            KeyConditionExpression=Key('date').eq(date_str)
        )
    except ClientError as e:
        print(f"Error querying games: {e}")
        return

    raw_games = games_resp.get('Items', [])

    # Build Payload
    formatted_games = []
    for g in raw_games:
        formatted_games.append({
            'id': g.get('id'),
            'homescore': to_native(g.get('homescore')),
            'awayscore': to_native(g.get('awayscore')),
            'hometeam': g.get('hometeam'),
            'awayteam': g.get('awayteam'),
            'starttime': g.get('starttime'),
            'clock': g.get('clock'),
            'status': g.get('status'),
            'date': g.get('date'),
            'homerecord': g.get('homerecord'),
            'awayrecord': g.get('awayrecord')
        })

    payload = json.dumps({
        'type': "date",
        'data': formatted_games
    })

    # Fan-out to connections
    for conn_id in connections:
        try:
            apigw_client.post_to_connection(
                ConnectionId=conn_id,
                Data=payload
            )
        except apigw_client.exceptions.GoneException:
            # 410 Gone: Connection is stale, delete it
            print(f"Found stale connection: {conn_id}")
            try:
                # The table key is simple: { connectionId }
                conn_table.delete_item(
                    Key={
                        'connectionId': conn_id
                    }
                )
            except ClientError as e:
                print(f"Failed to delete stale connection {conn_id}: {e}")
        except Exception as e:
            # Log other errors but keep loop going
            print(f"Failed to send to {conn_id}: {e}")

def to_native(val):
    """Helper: Convert Decimal to int or float"""
    if isinstance(val, Decimal):
        return int(val) if val % 1 == 0 else float(val)
    return val