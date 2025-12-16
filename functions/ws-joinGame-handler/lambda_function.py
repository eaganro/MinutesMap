import json
import time
import boto3
from datetime import datetime, timezone

# Initialize DynamoDB resource outside the handler for connection reuse
dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('CONNECTIONS_TABLE')

def handler(event, context):
    # Parse Input
    connection_id = event['requestContext']['connectionId']

    body = json.loads(event.get('body', '{}'))
    game_id = body.get('gameId')

    # Calculate TTL (12 hours from now)
    ttl_seconds = 12 * 60 * 60
    expires_at = int(time.time()) + ttl_seconds
    
    # Generate ISO timestamp
    # Use timezone.utc to ensure it's UTC
    connected_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    # Write to DynamoDB
    table = dynamodb.Table(TABLE_NAME)
    
    table.put_item(
        Item={
            'connectionId': connection_id,
            'gameId': game_id,
            'connectedAt': connected_at,
            'expiresAt': expires_at
        }
    )

    return {
        'statusCode': 200
    }