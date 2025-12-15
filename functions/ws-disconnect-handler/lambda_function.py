import boto3
from botocore.exceptions import ClientError

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')

def handler(event, context):
    connection_id = event['requestContext']['connectionId']

    try:
        # Delete from GameConnections
        table_games = dynamodb.Table("GameConnections")
        table_games.delete_item(
            Key={'connectionId': connection_id}
        )

        # Delete from DateConnections
        table_dates = dynamodb.Table("DateConnections")
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