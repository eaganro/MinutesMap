import json
import os
import re
import urllib.parse
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# Initialize Clients
dynamodb = boto3.resource('dynamodb')
CONN_TABLE_NAME = os.environ.get('CONN_TABLE')
WS_API_ENDPOINT = os.environ.get('WS_API_ENDPOINT')

# API Gateway Client
apigw_client = boto3.client('apigatewaymanagementapi', endpoint_url=WS_API_ENDPOINT)

def handler(event, context):
    # Regex to match relevant S3 keys. Note: the S3 event key is URL-encoded.
    box_pattern = re.compile(r"^data/boxData/(.+?)\.json")
    pbp_processed_pattern = re.compile(r"^data/processed-data/playByPlayData/(.+?)\.json")

    for record in event.get('Records', []):
        s3_object = record.get('s3', {}).get('object', {})
        key = urllib.parse.unquote_plus(s3_object.get('key', ''))
        raw_etag = s3_object.get('eTag', '')
        
        # Clean eTag (remove quotes)
        version = raw_etag.replace('"', '')

        # Determine which kind of update this is.
        # - Box score: keep legacy location `data/boxData/...`
        # - Play-by-play: ONLY notify for the processed slim payload under `data/processed-data/...`
        match = pbp_processed_pattern.match(key)
        if match:
            game_id = match.group(1)
        else:
            match = box_pattern.match(key)
            if not match:
                continue
            game_id = match.group(1)

        # Find all subscribers for this game
        table = dynamodb.Table(CONN_TABLE_NAME)
        try:
            response = table.query(
                IndexName="gameId-index",
                KeyConditionExpression=Key('gameId').eq(game_id)
            )
        except ClientError as e:
            print(f"Error querying subscribers for game {game_id}: {e}")
            continue

        connections = response.get('Items', [])

        # Broadcast key + version to every subscriber
        payload = json.dumps({
            "gameId": game_id,
            "key": key,
            "version": version
        })

        for item in connections:
            connection_id = item['connectionId']
            try:
                apigw_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=payload
                )
            except apigw_client.exceptions.GoneException:
                # 410 Gone: The connection is no longer valid. Delete it.
                try:
                    table.delete_item(
                        Key={'connectionId': connection_id}
                    )
                except ClientError as e:
                    print(f"Failed to delete stale connection {connection_id}: {e}")
            except Exception as e:
                print(f"Failed to send update to {connection_id}: {e}")

    return {'statusCode': 200}
