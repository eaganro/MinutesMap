import json
import time
import os
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from decimal import Decimal

# Constants
DATE_CONN_TABLE = os.environ.get('DATE_CONN_TABLE')
GAMES_TABLE = os.environ.get('GAMES_TABLE')
GAMES_GSI = os.environ.get('GAMES_GSI')
WS_API_ENDPOINT = os.environ.get('WS_API_ENDPOINT')

# Initialize clients
dynamodb = boto3.resource('dynamodb')
apigw_client = boto3.client('apigatewaymanagementapi', endpoint_url=WS_API_ENDPOINT)

def handler(event, context):
    connection_id = event['requestContext']['connectionId']
    body = json.loads(event.get('body', '{}'))
    date_str = body.get('date') # e.g. "2025-05-07"

    # Setup Times
    ttl_seconds = 12 * 60 * 60
    expires_at = int(time.time()) + ttl_seconds
    connected_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    # Record the subscription
    table_conn = dynamodb.Table(DATE_CONN_TABLE)
    table_conn.put_item(
        Item={
            'dateString': date_str,
            'connectionId': connection_id,
            'connectedAt': connected_at,
            'expiresAt': expires_at
        }
    )

    # Fetch all games on that date from NBA_Games using GSI
    table_games = dynamodb.Table(GAMES_TABLE)
    response = table_games.query(
        IndexName=GAMES_GSI,
        KeyConditionExpression=Key('date').eq(date_str)
    )
    games = response.get('Items', [])

    # Format and Send games to client
    formatted_games = []
    for g in games:
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

    try:
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=payload
        )
    except Exception as e:
        print(f"Error: {e}")
        return {'statusCode': 500, 'body': str(e)}

    return {
        'statusCode': 200,
        'body': "Subscribed to date and sent initial games"
    }

def to_native(val):
    """Helper to convert DynamoDB Decimals to int/float for JSON serialization"""
    if isinstance(val, Decimal):
        return int(val) if val % 1 == 0 else float(val)
    return val