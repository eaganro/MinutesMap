import sys
import os
import json
import boto3
import pytest
from moto import mock_aws
from unittest.mock import patch, MagicMock
from decimal import Decimal

LAMBDA_PATH = os.path.join(os.path.dirname(__file__), "../gameDateUpdates/lambda_function.py")

class TestGameDateUpdates:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.games_table_name = "NBA_Games"
            self.games_gsi_name = "ByDate"
            self.date_conn_table_name = "DateConnections"
            self.date_index_name = "date-index"
            self.ws_endpoint = "https://example.com"
        
            # Set environment variables
            os.environ["GAMES_TABLE"] = self.games_table_name
            os.environ["GAMES_GSI"] = self.games_gsi_name
            os.environ["DATE_CONN_TABLE"] = self.date_conn_table_name
            os.environ["DATE_INDEX_NAME"] = self.date_index_name
            os.environ["WS_API_ENDPOINT"] = self.ws_endpoint
        
            # Mock DynamoDB
            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        
            # Create Games Table
            self.games_table = self.dynamodb.create_table(
                TableName=self.games_table_name,
                KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
                AttributeDefinitions=[
                    {"AttributeName": "PK", "AttributeType": "S"},
                    {"AttributeName": "SK", "AttributeType": "S"},
                    {"AttributeName": "date", "AttributeType": "S"}
                ],
                GlobalSecondaryIndexes=[{
                    "IndexName": self.games_gsi_name,
                    "KeySchema": [{"AttributeName": "date", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                    "ProvisionedThroughput": {"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
                }],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )

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

            # Import module (re-import to pick up env vars if necessary, though mocked boto3 resource handles logic)
            self.module = lambda_loader(LAMBDA_PATH, "game_date_updates_lambda")
            # Patch the module's dynamodb resource to use our mocked one
            self.module.dynamodb = self.dynamodb
            
            yield

    def test_handler_fanout_success(self):
        # Seed Data
        date_str = "2023-12-25"
        
        # Seed a Game
        self.games_table.put_item(Item={
            "PK": "GAME#1", "SK": f"DATE#{date_str}", "date": date_str,
            "id": "1", "hometeam": "LAL", "awayteam": "BOS", 
            "homescore": 100, "awayscore": 90, 
            "status": "Final", "starttime": "2023-12-25T12:00:00",
            "clock": "00:00", "homerecord": "10-0", "awayrecord": "0-10"
        })

        # Seed a Connection
        conn_id = "conn123"
        self.date_conn_table.put_item(Item={
            "dateString": date_str,
            "connectionId": conn_id
        })

        # Mock API Gateway Client
        mock_apigw = MagicMock()
        self.module.apigw_client = mock_apigw

        # Simulate DynamoDB Stream Event
        event = {
            "Records": [
                {
                    "eventName": "MODIFY",
                    "dynamodb": {
                        "NewImage": {
                            "date": {"S": date_str}
                        }
                    }
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
        assert payload['type'] == 'date'
        assert len(payload['data']) == 1
        assert payload['data'][0]['hometeam'] == 'LAL'

    def test_handler_stale_connection_deletion(self):
        # Seed Data
        date_str = "2023-12-25"
        conn_id = "stale_conn"
        self.date_conn_table.put_item(Item={"dateString": date_str, "connectionId": conn_id})
        
        # Seed a game so the loop runs
        self.games_table.put_item(Item={
            "PK": "GAME#1", "SK": f"DATE#{date_str}", "date": date_str,
            "id": "1", "homescore": 0, "awayscore": 0
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
            "Records": [{"eventName": "MODIFY", "dynamodb": {"NewImage": {"date": {"S": date_str}}}}]
        }

        # Run
        self.module.handler(event, {})

        # Verify Deletion
        # Check if item is gone from DateConnections
        resp = self.date_conn_table.get_item(Key={"dateString": date_str, "connectionId": conn_id})
        assert "Item" not in resp

    def test_handler_ignores_records_missing_date(self):
        # Records without a usable date should not trigger any fanout.
        self.module.process_date_update = MagicMock()
        event = {
            "Records": [
                {"eventName": "MODIFY", "dynamodb": {"NewImage": {}}},
                {"eventName": "INSERT", "dynamodb": {"NewImage": {"date": {"N": "1"}}}},
            ]
        }
        self.module.handler(event, {})
        assert not self.module.process_date_update.called

    def test_to_native_converts_decimal(self):
        # Decimal values should convert to int/float for JSON serialization.
        assert self.module.to_native(Decimal("10")) == 10
        assert self.module.to_native(Decimal("10.5")) == 10.5
