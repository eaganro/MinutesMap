import json
import time
import os
import boto3
from datetime import datetime, timezone

# Constants
DATE_CONN_TABLE = os.environ.get('DATE_CONN_TABLE')

# Initialize clients
dynamodb = boto3.resource('dynamodb')

def handler(event, context):
    connection_id = event['requestContext']['connectionId']
    body = json.loads(event.get('body', '{}'))
    date_str = body.get('date') # e.g. "2025-05-07"
    if not date_str:
        return {'statusCode': 400, 'body': "Missing date"}

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

    return {
        'statusCode': 200
    }
