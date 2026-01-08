import os
import json
import boto3
import pytest
from moto import mock_aws
from unittest.mock import MagicMock

class TestWsJoinGame:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.table_name = "ConnectionsTable"
            os.environ["CONNECTIONS_TABLE"] = self.table_name
            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
            self.table = self.dynamodb.create_table(
                TableName=self.table_name,
                KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": "connectionId", "AttributeType": "S"}],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )
            path = os.path.join(os.path.dirname(__file__), "../ws-joinGame-handler/lambda_function.py")
            self.module = lambda_loader(path, "ws_join_game")
            self.module.dynamodb = self.dynamodb
            yield

    def test_join_game_success(self):
        event = {
            "requestContext": {"connectionId": "conn1"},
            "body": json.dumps({"gameId": "game123"})
        }
        resp = self.module.handler(event, {})
        assert resp["statusCode"] == 200
        
        item = self.table.get_item(Key={"connectionId": "conn1"})["Item"]
        assert item["gameId"] == "game123"
        assert "connectedAt" in item
        assert "expiresAt" in item

class TestWsJoinDate:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.conn_table_name = "DateConnections"
        
            os.environ["DATE_CONN_TABLE"] = self.conn_table_name
        
            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        
            # Connection Table (PK = connectionId, GSI = dateString)
            self.conn_table = self.dynamodb.create_table(
                TableName=self.conn_table_name,
                KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
                AttributeDefinitions=[
                    {"AttributeName": "connectionId", "AttributeType": "S"},
                    {"AttributeName": "dateString", "AttributeType": "S"}
                ],
                GlobalSecondaryIndexes=[{
                    "IndexName": "date-index",
                    "KeySchema": [{"AttributeName": "dateString", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                    "ProvisionedThroughput": {"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
                }],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )

            path = os.path.join(os.path.dirname(__file__), "../ws-joinDate-handler/lambda_function.py")
            self.module = lambda_loader(path, "ws_join_date")
            self.module.dynamodb = self.dynamodb
            yield
    def test_join_date_success(self):
        # Store the subscription only
        date_str = "2023-10-30"

        event = {
            "requestContext": {"connectionId": "conn2"},
            "body": json.dumps({"date": date_str})
        }
        
        resp = self.module.handler(event, {})
        assert resp["statusCode"] == 200
        
        # Check Connection stored
        item = self.conn_table.get_item(Key={"connectionId": "conn2"})["Item"]
        assert item["connectionId"] == "conn2"

class TestWsDisconnect:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.game_conn_table = "GameConn"
            self.date_conn_table = "DateConn"
            
            os.environ["GAME_CONN_TABLE"] = self.game_conn_table
            os.environ["DATE_CONN_TABLE"] = self.date_conn_table
            
            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
            
            # Game Conn Table (Simple Key assumed)
            self.table_games = self.dynamodb.create_table(
                TableName=self.game_conn_table,
                KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": "connectionId", "AttributeType": "S"}],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )

            # Date Conn Table
            self.table_dates = self.dynamodb.create_table(
                TableName=self.date_conn_table,
                KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": "connectionId", "AttributeType": "S"}],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )
            
            path = os.path.join(os.path.dirname(__file__), "../ws-disconnect-handler/lambda_function.py")
            self.module = lambda_loader(path, "ws_disconnect")
            self.module.dynamodb = self.dynamodb
            yield

    def test_disconnect_success(self):
        conn_id = "conn_del"
        self.table_games.put_item(Item={"connectionId": conn_id})
        self.table_dates.put_item(Item={"connectionId": conn_id})
        
        event = {"requestContext": {"connectionId": conn_id}}
        resp = self.module.handler(event, {})
        
        assert resp["statusCode"] == 200
        
        # Verify deletion
        assert "Item" not in self.table_games.get_item(Key={"connectionId": conn_id})
        assert "Item" not in self.table_dates.get_item(Key={"connectionId": conn_id})

    def test_disconnect_exception_returns_200(self):
        # Disconnect errors should be swallowed so API Gateway doesn't retry.
        failing_table = MagicMock()
        failing_table.delete_item.side_effect = Exception("boom")
        self.module.dynamodb = MagicMock()
        self.module.dynamodb.Table.return_value = failing_table

        event = {"requestContext": {"connectionId": "conn_fail"}}
        resp = self.module.handler(event, {})
        assert resp["statusCode"] == 200

class TestWsUnfollowDate:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.conn_table_name = "DateConnections"
            os.environ["DATE_CONN_TABLE"] = self.conn_table_name
            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
            self.conn_table = self.dynamodb.create_table(
                TableName=self.conn_table_name,
                KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": "connectionId", "AttributeType": "S"}],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )

            path = os.path.join(os.path.dirname(__file__), "../ws-unfollowDate-handler/lambda_function.py")
            self.module = lambda_loader(path, "ws_unfollow_date")
            self.module.dynamodb = self.dynamodb
            yield

    def test_unfollow_date_success(self):
        conn_id = "conn_date"
        self.conn_table.put_item(Item={"connectionId": conn_id})
        event = {"requestContext": {"connectionId": conn_id}}
        resp = self.module.handler(event, {})
        assert resp["statusCode"] == 200
        assert "Item" not in self.conn_table.get_item(Key={"connectionId": conn_id})

class TestWsUnfollowGame:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.conn_table_name = "GameConnections"
            os.environ["GAME_CONN_TABLE"] = self.conn_table_name
            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
            self.conn_table = self.dynamodb.create_table(
                TableName=self.conn_table_name,
                KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": "connectionId", "AttributeType": "S"}],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )

            path = os.path.join(os.path.dirname(__file__), "../ws-unfollowGame-handler/lambda_function.py")
            self.module = lambda_loader(path, "ws_unfollow_game")
            self.module.dynamodb = self.dynamodb
            yield

    def test_unfollow_game_success(self):
        conn_id = "conn_game"
        self.conn_table.put_item(Item={"connectionId": conn_id})
        event = {"requestContext": {"connectionId": conn_id}}
        resp = self.module.handler(event, {})
        assert resp["statusCode"] == 200
        assert "Item" not in self.conn_table.get_item(Key={"connectionId": conn_id})
