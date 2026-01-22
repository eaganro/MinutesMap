import os
import json
import gzip
import boto3
import pytest
from moto import mock_aws
from unittest.mock import patch, MagicMock

LAMBDA_PATH = os.path.join(os.path.dirname(__file__), "../FetchTodaysScoreboard/lambda_function.py")

class TestFetchTodaysScoreboard:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        with mock_aws():
            self.bucket_name = "test-bucket"
            os.environ["DATA_BUCKET"] = self.bucket_name
            os.environ["SCHEDULE_PREFIX"] = "schedule/"
            os.environ["AWS_REGION"] = "us-east-1"
            self.s3 = boto3.client("s3", region_name="us-east-1")
            self.s3.create_bucket(Bucket=self.bucket_name)
            self.module = lambda_loader(LAMBDA_PATH, "fetch_scoreboard_lambda")
            self.module.s3_client = self.s3
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

        # Verify S3 upload
        resp = self.s3.get_object(
            Bucket=self.bucket_name,
            Key="schedule/2023-10-25.json.gz",
        )
        payload = gzip.decompress(resp["Body"].read())
        items = json.loads(payload.decode("utf-8"))
        assert len(items) == 1
        assert items[0]["id"] == "2023-10-25-bos-nyk"
        assert items[0]["hometeam"] == "NYK"
        assert items[0]["awayscore"] == 104

        map_resp = self.s3.get_object(
            Bucket=self.bucket_name,
            Key="private/gameIdMap/2023-10-25.json",
        )
        mapping = json.loads(map_resp["Body"].read().decode("utf-8"))
        assert mapping["2023-10-25-bos-nyk"] == "12345"

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

        resp = self.s3.list_objects_v2(Bucket=self.bucket_name, Prefix="schedule/")
        assert resp.get("KeyCount", 0) == 0
