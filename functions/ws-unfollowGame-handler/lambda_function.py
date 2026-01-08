import boto3
import os
from botocore.exceptions import ClientError

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')

GAME_TABLE_NAME = os.environ.get('GAME_CONN_TABLE')

def handler(event, context):
    connection_id = event['requestContext']['connectionId']

    try:
        table_games = dynamodb.Table(GAME_TABLE_NAME)
        table_games.delete_item(
            Key={'connectionId': connection_id}
        )

        return {
            'statusCode': 200,
            'body': 'Unfollowed game'
        }

    except Exception as e:
        print(f"Error unfollowing game for {connection_id}: {e}")
        return {'statusCode': 200}
