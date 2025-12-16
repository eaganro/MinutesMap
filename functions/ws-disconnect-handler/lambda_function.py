import boto3
from botocore.exceptions import ClientError

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')

GAME_TABLE_NAME = os.environ.get('GAME_CONN_TABLE')
DATE_TABLE_NAME = os.environ.get('DATE_CONN_TABLE')

def handler(event, context):
    connection_id = event['requestContext']['connectionId']

    try:
        # Delete from GameConnections
        table_games = dynamodb.Table(GAME_TABLE_NAME)
        table_games.delete_item(
            Key={'connectionId': connection_id}
        )

        # Delete from DateConnections
        table_dates = dynamodb.Table(DATE_TABLE_NAME)
        table_dates.delete_item(
            Key={'connectionId': connection_id}
        )

        return {
            'statusCode': 200,
            'body': 'Disconnected'
        }

    except Exception as e:
        print(f"Error disconnecting {connection_id}: {e}")
        # Return 200 anyway so API Gateway doesn't retry the disconnect event
        return {'statusCode': 200}