import json
import os
import boto3
import pytest
from moto import mock_aws
from unittest.mock import MagicMock


class TestWsSendGameUpdate:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.table_name = "GameConnections"
            os.environ["CONN_TABLE"] = self.table_name
            os.environ["WS_API_ENDPOINT"] = "https://example.com"

            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
            self.table = self.dynamodb.create_table(
                TableName=self.table_name,
                KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
                AttributeDefinitions=[
                    {"AttributeName": "connectionId", "AttributeType": "S"},
                    {"AttributeName": "gameId", "AttributeType": "S"},
                ],
                GlobalSecondaryIndexes=[{
                    "IndexName": "gameId-index",
                    "KeySchema": [{"AttributeName": "gameId", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                    "ProvisionedThroughput": {"ReadCapacityUnits": 1, "WriteCapacityUnits": 1},
                }],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1},
            )

            path = os.path.join(os.path.dirname(__file__), "../ws-sendGameUpdate-handler/lambda_function.py")
            self.module = lambda_loader(path, "ws_send_game_update")
            self.module.dynamodb = self.dynamodb
            yield

    def test_processed_playbyplay_key_fanout(self):
        # Ensures processed play-by-play keys notify subscribers with clean ETag.
        self.table.put_item(Item={"connectionId": "c1", "gameId": "12345"})
        mock_apigw = MagicMock()
        self.module.apigw_client = mock_apigw

        event = {
            "Records": [{
                "s3": {"object": {"key": "data/processed-data/playByPlayData/12345.json", "eTag": "\"etag123\""}}
            }]
        }

        resp = self.module.handler(event, {})
        assert resp["statusCode"] == 200

        assert mock_apigw.post_to_connection.called
        call_args = mock_apigw.post_to_connection.call_args
        assert call_args.kwargs["ConnectionId"] == "c1"
        payload = json.loads(call_args.kwargs["Data"])
        assert payload["gameId"] == "12345"
        assert payload["key"] == "data/processed-data/playByPlayData/12345.json"
        assert payload["version"] == "etag123"

    def test_ignores_non_matching_keys(self):
        # Non-matching keys should be ignored (no websocket sends).
        self.table.put_item(Item={"connectionId": "c1", "gameId": "12345"})
        mock_apigw = MagicMock()
        self.module.apigw_client = mock_apigw

        event = {
            "Records": [{
                "s3": {"object": {"key": "data/otherData/12345.json", "eTag": "\"etag123\""}}
            }]
        }

        self.module.handler(event, {})
        assert not mock_apigw.post_to_connection.called

    def test_stale_connection_deleted(self):
        # 410 Gone should delete the stale connection from DynamoDB.
        self.table.put_item(Item={"connectionId": "stale1", "gameId": "999"})
        mock_apigw = MagicMock()

        class GoneException(Exception):
            pass

        mock_apigw.exceptions.GoneException = GoneException
        mock_apigw.post_to_connection.side_effect = GoneException("Gone")
        self.module.apigw_client = mock_apigw

        event = {
            "Records": [{
                "s3": {"object": {"key": "data/boxData/999.json", "eTag": "\"etag999\""}}
            }]
        }

        self.module.handler(event, {})
        resp = self.table.get_item(Key={"connectionId": "stale1"})
        assert "Item" not in resp
