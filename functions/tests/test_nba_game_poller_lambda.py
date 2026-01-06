import os
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from unittest.mock import MagicMock


UTC_ZONE = ZoneInfo("UTC")


class TestNbaGamePollerLambda:
    @pytest.fixture(autouse=True)
    def setup_env(self, lambda_loader):
        os.environ["AWS_REGION"] = "us-east-1"
        os.environ["DATA_BUCKET"] = "test-bucket"
        os.environ["POLLER_RULE_NAME"] = "test-rule"
        os.environ["LAMBDA_ARN"] = "arn:aws:lambda:us-east-1:123:function:test"
        os.environ["SCHEDULER_ROLE_ARN"] = "arn:aws:iam::123:role/test"

        path = os.path.join(os.path.dirname(__file__), "../nba-game-poller/lambda_function.py")
        self.module = lambda_loader(path, "nba_game_poller_lambda_extra")
        yield

    def test_calculate_safe_sleep_without_context(self):
        # When no context is available, sleep should be within the polite range.
        sleep_seconds = self.module.calculate_safe_sleep(None, 0, 3)
        assert 1.0 <= sleep_seconds <= 3.0

    def test_calculate_safe_sleep_tight_budget_returns_zero(self):
        # Tight time budgets should skip sleeping to avoid timeouts.
        context = MagicMock()
        context.get_remaining_time_in_millis.return_value = 3000
        sleep_seconds = self.module.calculate_safe_sleep(context, 0, 3)
        assert sleep_seconds == 0.0

    def test_get_earliest_start_time_skips_invalid(self):
        # Invalid start times should be ignored when selecting the earliest game.
        games = [
            {"starttime": "not-a-date"},
            {"starttime": "2025-01-01T19:00:00Z"},
            {"starttime": "2025-01-01T18:00:00Z"},
        ]
        earliest = self.module.get_earliest_start_time(games)
        expected = datetime(2025, 1, 1, 23, 0, tzinfo=UTC_ZONE)
        assert earliest == expected

    def test_poller_logic_disables_when_no_games(self):
        # Poller should disable itself when no games are scheduled.
        self.module.get_nba_date = MagicMock(return_value="2025-01-01")
        self.module.get_games_from_s3 = MagicMock(return_value=[])
        self.module.disable_self = MagicMock()

        self.module.poller_logic(None)
        assert self.module.disable_self.called
