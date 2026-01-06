import os
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest


ET_ZONE = ZoneInfo("America/New_York")


class TestNbaGamePollerHelpers:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        os.environ["AWS_REGION"] = "us-east-1"
        os.environ["DATA_BUCKET"] = "test-bucket"
        os.environ["POLLER_RULE_NAME"] = "test-rule"
        os.environ["LAMBDA_ARN"] = "arn:aws:lambda:us-east-1:123:function:test"
        os.environ["SCHEDULER_ROLE_ARN"] = "arn:aws:iam::123:role/test"

        path = os.path.join(os.path.dirname(__file__), "../nba-game-poller/lambda_function.py")
        self.module = lambda_loader(path, "nba_game_poller_lambda")
        yield

    def test_parse_start_time_et_handles_z_as_et(self):
        # NBA API uses 'Z' for ET; ensure we interpret it as ET.
        dt = self.module.parse_start_time_et("2025-01-01T19:00:00Z")
        assert dt is not None
        assert dt.tzinfo == ET_ZONE
        assert dt.hour == 19

    def test_parse_start_time_et_invalid(self):
        # Invalid timestamps should return None.
        assert self.module.parse_start_time_et("not-a-date") is None

    def test_status_indicates_live(self):
        # Common in-game status strings should be recognized as live.
        assert self.module.status_indicates_live({"status": "Q3 10:21"})
        assert self.module.status_indicates_live({"status": "Halftime"})
        assert self.module.status_indicates_live({"status": "OT"})
        assert not self.module.status_indicates_live({"status": "Final"})
        assert not self.module.status_indicates_live({"status": "7:30 PM ET"})

    def test_has_game_started_uses_time_when_not_live(self):
        # If not live, start time should gate game start.
        game = {"status": "Scheduled", "starttime": "2025-01-01T19:00:00Z"}
        now_et = datetime(2025, 1, 1, 19, 30, tzinfo=ET_ZONE)
        assert self.module.has_game_started(game, now_et)

        now_before = datetime(2025, 1, 1, 18, 0, tzinfo=ET_ZONE)
        assert not self.module.has_game_started(game, now_before)
