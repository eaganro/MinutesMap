import boto3
import os
from botocore.exceptions import ClientError

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')

DATE_TABLE_NAME = os.environ.get('DATE_CONN_TABLE')

def handler(event, context):
    connection_id = event['requestContext']['connectionId']

    try:
        table_dates = dynamodb.Table(DATE_TABLE_NAME)
        table_dates.delete_item(
            Key={'connectionId': connection_id}
        )

        return {
            'statusCode': 200,
            'body': 'Unfollowed date'
        }

    except Exception as e:
        print(f"Error unfollowing date for {connection_id}: {e}")
        return {'statusCode': 200}
