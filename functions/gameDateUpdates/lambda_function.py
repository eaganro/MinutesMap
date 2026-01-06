import json
import os
import re
import boto3
from urllib.parse import unquote_plus
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# Initialize Clients
dynamodb = boto3.resource('dynamodb')

# Constants from Env Vars
DATE_CONN_TABLE_NAME = os.environ.get('DATE_CONN_TABLE', 'DateConnections')
DATE_INDEX_NAME = os.environ.get('DATE_INDEX_NAME', 'date-index')
WS_API_ENDPOINT = os.environ.get('WS_API_ENDPOINT')
SCHEDULE_PREFIX = os.environ.get('SCHEDULE_PREFIX', 'schedule/')

# API Gateway Client
apigw_client = boto3.client('apigatewaymanagementapi', endpoint_url=WS_API_ENDPOINT)

def handler(event, context):
    """
    Triggered by S3 uploads to the schedule prefix.
    Sends a "fetch signal" to any clients subscribed to the updated date.
    """
    # Collect distinct dates from the S3 event batch to avoid duplicate notifications
    dates = set()
    for record in event.get('Records', []):
        if record.get('eventSource') != 'aws:s3':
            continue
        key = record.get('s3', {}).get('object', {}).get('key')
        if not key:
            continue
        date_val = extract_date_from_key(key)
        if date_val:
            dates.add(date_val)

    # Process each unique date
    for date_str in dates:
        notify_subscribers(date_str)

def extract_date_from_key(key):
    decoded = unquote_plus(key)
    if not decoded.startswith(SCHEDULE_PREFIX):
        return None
    filename = decoded[len(SCHEDULE_PREFIX):]
    for suffix in ('.json.gz', '.json'):
        if filename.endswith(suffix):
            filename = filename[: -len(suffix)]
            break
    else:
        return None
    date_str = filename.split('/')[-1]
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        return None
    return date_str

def notify_subscribers(date_str):
    conn_table = dynamodb.Table(DATE_CONN_TABLE_NAME)
    
    # Fetch subscribers for this date (Query DateConnections GSI)
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

    # Build "Signal" Payload
    payload = json.dumps({
        'type': 'date_update',
        'date': date_str,
        'timestamp': os.environ.get('aws_request_id') # Optional: helpful for debugging/deduping
    })

    print(f"Notifying {len(connections)} connections for date {date_str}")

    # Fan-out to connections
    for conn_id in connections:
        try:
            apigw_client.post_to_connection(
                ConnectionId=conn_id,
                Data=payload
            )
        except apigw_client.exceptions.GoneException:
            # 410 Gone: Connection is stale, delete it from DDB
            print(f"Found stale connection: {conn_id}")
            try:
                conn_table.delete_item(
                    Key={'connectionId': conn_id}
                )
            except ClientError as e:
                print(f"Failed to delete stale connection {conn_id}: {e}")
        except Exception as e:
            # Log other errors (e.g. Throttling) but keep the loop going
            print(f"Failed to send to {conn_id}: {e}")
