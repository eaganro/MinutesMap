import sys
import os
import json
import boto3
import pytest
from moto import mock_aws
from unittest.mock import patch, MagicMock

LAMBDA_PATH = os.path.join(os.path.dirname(__file__), "../FetchTodaysScoreboard/lambda_function.py")

class TestFetchTodaysScoreboard:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.table_name = "TestGamesTable"
            os.environ["GAMES_TABLE"] = self.table_name
            # Use boto3.resource directly as moto mocks it
            self.dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
            self.table = self.dynamodb.create_table(
                TableName=self.table_name,
                KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
                AttributeDefinitions=[{"AttributeName": "PK", "AttributeType": "S"}, {"AttributeName": "SK", "AttributeType": "S"}],
                ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
            )
            self.module = lambda_loader(LAMBDA_PATH, "fetch_scoreboard_lambda")
            self.module.dynamodb = self.dynamodb
            yield

    @patch("urllib.request.urlopen")
    def test_handler_success(self, mock_urlopen):
        # Mock API response
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({
            "scoreboard": {
                "games": [
                    {
                        "gameId": "12345",
                        "gameEt": "2023-10-25T19:30:00",
                        "gameClock": "12:00",
                        "gameStatusText": "Final",
                        "homeTeam": {"teamTricode": "NYK", "score": 100, "wins": 1, "losses": 0},
                        "awayTeam": {"teamTricode": "BOS", "score": 104, "wins": 0, "losses": 1}
                    }
                ]
            }
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # Run handler
        self.module.handler({}, {})

        # Verify DynamoDB
        items = self.table.scan()["Items"]
        assert len(items) == 1
        assert items[0]["PK"] == "GAME#12345"
        assert items[0]["hometeam"] == "NYK"
        assert items[0]["awayscore"] == 104

    @patch("urllib.request.urlopen")
    def test_handler_no_games_array(self, mock_urlopen):
        # Non-list games payloads should exit without writing rows.
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({
            "scoreboard": {"games": {"gameId": "123"}}
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        self.module.handler({}, {})

        items = self.table.scan()["Items"]
        assert len(items) == 0
