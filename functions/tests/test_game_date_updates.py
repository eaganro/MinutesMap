import os
import json
import boto3
import pytest
from moto import mock_aws
from unittest.mock import MagicMock

LAMBDA_PATH = os.path.join(os.path.dirname(__file__), "../gameDateUpdates/lambda_function.py")

class TestGameDateUpdates:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.games_table_name = "NBA_Games"
            self.date_conn_table_name = "DateConnections"
            self.date_index_name = "date-index"
            self.ws_endpoint = "https://example.com"
            self.request_id = "test-req-123"
        
            # Set environment variables
            os.environ["DATE_CONN_TABLE"] = self.date_conn_table_name
            os.environ["DATE_INDEX_NAME"] = self.date_index_name
            os.environ["WS_API_ENDPOINT"] = self.ws_endpoint
            os.environ["aws_request_id"] = self.request_id
        
            # Mock DynamoDB
            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        
            # Create Date Connections Table
            # Matches Terraform: PK = connectionId, GSI = dateString
            self.date_conn_table = self.dynamodb.create_table(
                TableName=self.date_conn_table_name,
                KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
                AttributeDefinitions=[
                    {"AttributeName": "connectionId", "AttributeType": "S"},
                    {"AttributeName": "dateString", "AttributeType": "S"}
                ],
                GlobalSecondaryIndexes=[{
                    "IndexName": self.date_index_name,
                    "KeySchema": [{"AttributeName": "dateString", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                    "ProvisionedThroughput": {"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
                }],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )

            # Import module
            self.module = lambda_loader(LAMBDA_PATH, "game_date_updates_lambda")
            # Patch the module's dynamodb resource to use our mocked one
            self.module.dynamodb = self.dynamodb
            
            yield

    def test_handler_fanout_success(self):
        # Seed Data
        date_str = "2023-12-25"
        conn_id = "conn123"

        # Seed a Connection (User is looking at this date)
        self.date_conn_table.put_item(Item={
            "dateString": date_str,
            "connectionId": conn_id
        })

        # Mock API Gateway Client
        mock_apigw = MagicMock()
        self.module.apigw_client = mock_apigw

        # Simulate S3 Event
        event = {
            "Records": [
                {
                    "eventSource": "aws:s3",
                    "s3": {
                        "object": {
                            "key": f"schedule/{date_str}.json.gz"
                        }
                    },
                    "eventName": "ObjectCreated:Put"
                }
            ]
        }

        # Run Handler
        self.module.handler(event, {})

        # Verify
        # Check if post_to_connection was called
        assert mock_apigw.post_to_connection.called
        call_args = mock_apigw.post_to_connection.call_args
        assert call_args.kwargs['ConnectionId'] == conn_id
        
        payload = json.loads(call_args.kwargs['Data'])
        assert payload['type'] == 'date_update'
        assert payload['date'] == date_str

    def test_handler_stale_connection_deletion(self):
        # Seed Data
        date_str = "2023-12-25"
        conn_id = "stale_conn"
        
        # Seed the connection
        self.date_conn_table.put_item(Item={
            "dateString": date_str, 
            "connectionId": conn_id
        })
        
        # Mock API Gateway to raise GoneException
        mock_apigw = MagicMock()
        
        # Define a real exception class for the mock to use
        class GoneException(Exception):
            pass
        
        # Mock the exceptions structure
        mock_apigw.exceptions.GoneException = GoneException
        
        # Set the side effect to raise an instance of this exception
        mock_apigw.post_to_connection.side_effect = GoneException("Gone")
        self.module.apigw_client = mock_apigw

        # Event
        event = {
            "Records": [
                {
                    "eventSource": "aws:s3",
                    "s3": {"object": {"key": f"schedule/{date_str}.json.gz"}},
                    "eventName": "ObjectCreated:Put",
                }
            ]
        }

        # Run
        self.module.handler(event, {})

        # Verify Deletion
        # Check if item is gone from DateConnections
        resp = self.date_conn_table.get_item(Key={"connectionId": conn_id})
        assert "Item" not in resp

    def test_handler_ignores_records_missing_date(self):
        # Records without a usable date should not trigger any fanout.
        # We mock 'notify_subscribers'
        self.module.notify_subscribers = MagicMock()
        
        event = {
            "Records": [
                {"eventSource": "aws:s3", "s3": {"object": {"key": "schedule/not-a-date.json.gz"}}},
                {"eventSource": "aws:s3", "s3": {"object": {"key": "data/boxData/123.json.gz"}}},
            ]
        }
        self.module.handler(event, {})
        assert not self.module.notify_subscribers.called
