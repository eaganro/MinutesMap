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

    def test_process_game_promotes_play_final_when_box_regresses(self):
        game_item = {
            "id": "2026-02-04-phi-lal",
            "nbaGameId": "0022500001",
            "status": "Q4 00:05",
            "homescore": 98,
            "awayscore": 100,
        }

        play_payload = {
            "game": {
                "homeTeamId": 1610612747,
                "awayTeamId": 1610612755,
                "actions": [
                    {
                        "description": "Game End",
                        "period": 4,
                        "clock": "PT00M00.00S",
                        "scoreHome": "104",
                        "scoreAway": "118",
                    }
                ],
            }
        }
        box_payload = {
            "game": {
                "gameStatusText": "Scheduled",
                "gameClock": "",
                "homeTeam": {
                    "teamId": 1610612747,
                    "score": 0,
                    "wins": 0,
                    "losses": 0,
                },
                "awayTeam": {
                    "teamId": 1610612755,
                    "score": 0,
                    "wins": 0,
                    "losses": 0,
                },
            }
        }

        def fake_fetch(url, _etag=None, _ua=None):
            if "playbyplay" in url:
                return play_payload, "play-etag"
            if "boxscore" in url:
                return box_payload, "box-etag"
            return None, None

        self.module.fetch_nba_data_urllib = fake_fetch
        self.module.process_playbyplay_payload = MagicMock(return_value={"v": 2})
        self.module.build_box_payload = MagicMock(return_value={"teams": {}})
        self.module.upload_json_to_s3 = MagicMock()
        self.module.load_gamepack = MagicMock(return_value=None)

        is_final, updates = self.module.process_game(game_item, user_agent="ua", date_str="2026-02-04")

        # "Game End" should protect schedule state, but remain unconfirmed until box says Final.
        assert is_final is False
        assert updates["status"] == "Final"
        assert updates["homescore"] == 104
        assert updates["awayscore"] == 118
        assert updates["finalConfirmed"] is False
        assert isinstance(updates.get("finalPendingSince"), str)
        assert updates["finalPendingSince"]

    def test_process_game_enqueues_caption_worker_after_period_close(self):
        game_item = {
            "id": "2026-02-04-phi-lal",
            "nbaGameId": "0022500001",
            "status": "Q1 00:00",
        }

        play_payload = {
            "game": {
                "homeTeamId": 1610612747,
                "awayTeamId": 1610612755,
                "actions": [
                    {
                        "description": "End of 1st Period",
                        "period": 1,
                        "clock": "PT00M00.00S",
                        "scoreHome": "22",
                        "scoreAway": "28",
                    }
                ],
            }
        }
        box_payload = {
            "game": {
                "gameStatusText": "Q1 00:00",
                "gameClock": "PT00M00.00S",
                "homeTeam": {
                    "teamId": 1610612747,
                    "teamTricode": "LAL",
                    "score": 22,
                    "wins": 0,
                    "losses": 0,
                    "players": [],
                },
                "awayTeam": {
                    "teamId": 1610612755,
                    "teamTricode": "PHI",
                    "score": 28,
                    "wins": 0,
                    "losses": 0,
                    "players": [],
                },
            }
        }

        def fake_fetch(url, _etag=None, _ua=None):
            if "playbyplay" in url:
                return play_payload, "play-etag"
            if "boxscore" in url:
                return box_payload, "box-etag"
            return None, None

        processed_flow = {
            "v": 2,
            "periods": 4,
            "last": {"quarter": 1, "time": "00:00", "awayScore": 28, "homeScore": 22},
            "score": [{"quarter": 1, "time": "00:00", "awayScore": 28, "homeScore": 22}],
            "players": {"away": {}, "home": {}},
            "segments": {"away": {}, "home": {}},
        }
        self.module.fetch_nba_data_urllib = fake_fetch
        self.module.process_playbyplay_payload = MagicMock(return_value=processed_flow)
        self.module.build_box_payload = MagicMock(
            return_value={
                "teams": {
                    "away": {"abbr": "PHI", "players": []},
                    "home": {"abbr": "LAL", "players": []},
                }
            }
        )
        self.module.upload_json_to_s3 = MagicMock()
        self.module.load_gamepack = MagicMock(return_value=None)
        self.module.lambda_client = MagicMock()
        self.module.lambda_client.invoke = MagicMock(return_value={})
        self.module.AI_CAPTIONS_ENABLED = True
        self.module.GEMINI_API_KEY = "test-api-key"
        self.module.GEMINI_MODEL = "gemini-2.5-flash"
        self.module.LAMBDA_ARN = "arn:aws:lambda:us-east-1:123:function:test"

        is_final, updates = self.module.process_game(game_item, user_agent="ua", date_str="2026-02-04")

        assert is_final is False
        self.module.lambda_client.invoke.assert_called_once()
        assert updates["captions_requested_through"] == 1
        uploaded_payload = self.module.upload_json_to_s3.call_args.kwargs["data"]
        assert uploaded_payload["flow"] == processed_flow

    def test_caption_worker_generates_and_uploads_captions(self):
        existing_gamepack = {
            "v": 1,
            "id": "0022500001",
            "publicId": "2026-02-04-phi-lal",
            "box": {
                "teams": {
                    "away": {"abbr": "PHI"},
                    "home": {"abbr": "LAL"},
                }
            },
            "flow": {
                "v": 2,
                "last": {"quarter": 1, "time": "00:00", "awayScore": 28, "homeScore": 22},
                "score": [{"quarter": 1, "time": "00:00", "awayScore": 28, "homeScore": 22}],
                "players": {"away": {}, "home": {}},
                "segments": {"away": {}, "home": {}},
            },
        }
        generated_captions = {
            "v": 1,
            "provider": "gemini",
            "model": "gemini-2.5-flash",
            "updatedAt": "2026-02-04T12:00:00+00:00",
            "periods": {
                "1": {
                    "generatedAt": "2026-02-04T12:00:00+00:00",
                    "full": "PHI takes a six-point edge after a fast opening quarter.",
                    "players": [],
                }
            },
        }

        self.module.load_gamepack = MagicMock(return_value=existing_gamepack)
        self.module.build_period_captions = MagicMock(return_value=generated_captions)
        self.module.upload_json_to_s3 = MagicMock()
        self.module.AI_CAPTIONS_ENABLED = True
        self.module.GEMINI_API_KEY = "test-api-key"

        self.module.caption_worker_logic(
            {
                "task": "caption_worker",
                "gameKey": "2026-02-04-phi-lal",
                "status": "Final",
            }
        )

        self.module.build_period_captions.assert_called_once()
        self.module.upload_json_to_s3.assert_called_once()
        uploaded_payload = self.module.upload_json_to_s3.call_args.kwargs["data"]
        assert uploaded_payload["flow"]["captions"] == generated_captions

    def test_poller_processes_final_games_missing_cached_etags(self):
        self.module.get_nba_date = MagicMock(return_value="2026-02-13")
        self.module.get_games_from_s3 = MagicMock(
            return_value=[
                {
                    "id": "2026-02-13-vin-mel",
                    "status": "Final",
                    "finalConfirmed": True,
                    "starttime": "2026-02-13T22:35:00",
                }
            ]
        )
        self.module.load_game_id_map = MagicMock(return_value={})
        self.module.has_game_started = MagicMock(return_value=True)
        self.module.schedule_half_poller = MagicMock(return_value=False)
        self.module.process_game = MagicMock(return_value=(True, {}))
        self.module.update_manifest = MagicMock()
        self.module.upload_schedule_s3 = MagicMock()
        self.module.upload_init_state = MagicMock()
        self.module.disable_self = MagicMock()

        self.module.poller_logic(None)

        self.module.process_game.assert_called_once()
