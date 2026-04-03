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

    def test_process_game_enqueues_caption_worker_at_halftime_checkpoint(self):
        game_item = {
            "id": "2026-02-04-phi-lal",
            "nbaGameId": "0022500001",
            "status": "Q2 00:00",
        }

        play_payload = {
            "game": {
                "homeTeamId": 1610612747,
                "awayTeamId": 1610612755,
                "actions": [
                    {
                        "description": "End of 2nd Period",
                        "period": 2,
                        "clock": "PT00M00.00S",
                        "scoreHome": "52",
                        "scoreAway": "55",
                    }
                ],
            }
        }
        box_payload = {
            "game": {
                "gameStatusText": "Q2 00:00",
                "gameClock": "PT00M00.00S",
                "homeTeam": {
                    "teamId": 1610612747,
                    "teamTricode": "LAL",
                    "score": 52,
                    "wins": 0,
                    "losses": 0,
                    "players": [],
                },
                "awayTeam": {
                    "teamId": 1610612755,
                    "teamTricode": "PHI",
                    "score": 55,
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
            "last": {"quarter": 2, "time": "00:00", "awayScore": 55, "homeScore": 52},
            "score": [{"quarter": 2, "time": "00:00", "awayScore": 55, "homeScore": 52}],
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
        assert updates["captions_requested_through"] == 2
        uploaded_payload = self.module.upload_json_to_s3.call_args.kwargs["data"]
        assert uploaded_payload["flow"] == processed_flow

    def test_process_game_skips_caption_worker_for_end_of_first_quarter(self):
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
        self.module.lambda_client.invoke.assert_not_called()
        assert "captions_requested_through" not in updates

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

    def test_process_game_preserves_existing_captions_on_fresh_flow_upload(self):
        game_item = {
            "id": "2026-02-04-phi-lal",
            "nbaGameId": "0022500001",
            "status": "Q2 05:00",
        }

        play_payload = {
            "game": {
                "homeTeamId": 1610612747,
                "awayTeamId": 1610612755,
                "actions": [
                    {
                        "description": "Mid-quarter update",
                        "period": 2,
                        "clock": "PT05M00.00S",
                        "scoreHome": "44",
                        "scoreAway": "42",
                    }
                ],
            }
        }
        box_payload = {
            "game": {
                "gameStatusText": "Q2 05:00",
                "gameClock": "PT05M00.00S",
                "homeTeam": {
                    "teamId": 1610612747,
                    "teamTricode": "LAL",
                    "score": 44,
                    "wins": 0,
                    "losses": 0,
                    "players": [],
                },
                "awayTeam": {
                    "teamId": 1610612755,
                    "teamTricode": "PHI",
                    "score": 42,
                    "wins": 0,
                    "losses": 0,
                    "players": [],
                },
            }
        }

        existing_captions = {
            "v": 1,
            "provider": "gemini",
            "model": "gemini-2.5-flash",
            "updatedAt": "2026-02-04T12:00:00+00:00",
            "periods": {
                "1": {
                    "generatedAt": "2026-02-04T12:00:00+00:00",
                    "full": "PHI leads after one.",
                    "players": [],
                }
            },
        }
        existing_gamepack = {
            "flow": {
                "v": 2,
                "captions": existing_captions,
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
            "last": {"quarter": 2, "time": "05:00", "awayScore": 42, "homeScore": 44},
            "score": [{"quarter": 2, "time": "05:00", "awayScore": 42, "homeScore": 44}],
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
        self.module.load_gamepack = MagicMock(return_value=existing_gamepack)
        self.module.upload_json_to_s3 = MagicMock()
        self.module.GEMINI_API_KEY = ""

        self.module.process_game(game_item, user_agent="ua", date_str="2026-02-04")

        uploaded_payload = self.module.upload_json_to_s3.call_args.kwargs["data"]
        assert uploaded_payload["flow"]["captions"] == existing_captions

    def test_process_game_merges_kalshi_odds_when_nba_feeds_are_unchanged(self):
        game_item = {
            "id": "2026-04-04-det-phi",
            "nbaGameId": "0022600101",
            "status": "Q1 09:30",
            "time": "09:30",
            "awayteam": "DET",
            "hometeam": "PHI",
        }
        existing_gamepack = {
            "v": 1,
            "id": "0022600101",
            "publicId": "2026-04-04-det-phi",
            "box": {
                "teams": {
                    "away": {"abbr": "DET"},
                    "home": {"abbr": "PHI"},
                }
            },
            "flow": {
                "v": 2,
                "score": [],
                "players": {"away": {}, "home": {}},
                "segments": {"away": {}, "home": {}},
                "odds": [
                    {
                        "quarter": 1,
                        "time": "PT10M00.00S",
                        "awayWinProb": 0.52,
                        "source": "midpoint",
                        "marketTicker": "KXNBAGAME-26APR04DETPHI-DET",
                        "eventTicker": "KXNBAGAME-26APR04DETPHI",
                    }
                ],
            },
        }

        self.module.fetch_nba_data_urllib = MagicMock(return_value=(None, None))
        self.module.fetch_kalshi_event_markets = MagicMock(
            return_value=[
                {
                    "ticker": "KXNBAGAME-26APR04DETPHI-DET",
                    "yes_bid_dollars": "0.5600",
                    "yes_ask_dollars": "0.6000",
                    "last_price_dollars": "0.5900",
                },
                {
                    "ticker": "KXNBAGAME-26APR04DETPHI-PHI",
                    "yes_bid_dollars": "0.4200",
                    "yes_ask_dollars": "0.4600",
                    "last_price_dollars": "0.4300",
                },
            ]
        )
        self.module.load_gamepack = MagicMock(return_value=existing_gamepack)
        self.module.upload_json_to_s3 = MagicMock()

        is_final, updates = self.module.process_game(game_item, user_agent="ua", date_str="2026-04-04")

        assert is_final is False
        assert updates == {}
        uploaded_payload = self.module.upload_json_to_s3.call_args.kwargs["data"]
        assert uploaded_payload["flow"]["odds"] == [
            {
                "quarter": 1,
                "time": "1000.00",
                "awayWinProb": 0.52,
                "source": "midpoint",
                "marketTicker": "KXNBAGAME-26APR04DETPHI-DET",
                "eventTicker": "KXNBAGAME-26APR04DETPHI",
            },
            {
                "quarter": 1,
                "time": "09:30",
                "awayWinProb": 0.58,
                "source": "midpoint",
                "marketTicker": "KXNBAGAME-26APR04DETPHI-DET",
                "eventTicker": "KXNBAGAME-26APR04DETPHI",
            },
        ]

    def test_process_game_backfills_kalshi_odds_for_new_actions_between_polls(self):
        game_item = {
            "id": "2026-04-04-det-phi",
            "nbaGameId": "0022600101",
            "status": "Q1 09:10",
            "time": "09:10",
            "awayteam": "DET",
            "hometeam": "PHI",
        }
        existing_gamepack = {
            "v": 1,
            "id": "0022600101",
            "publicId": "2026-04-04-det-phi",
            "box": {
                "teams": {
                    "away": {"abbr": "DET"},
                    "home": {"abbr": "PHI"},
                }
            },
            "flow": {
                "v": 2,
                "last": {"quarter": 1, "time": "10:00", "seq": 10, "awayScore": 2, "homeScore": 0},
                "score": [],
                "players": {"away": {}, "home": {}},
                "segments": {"away": {}, "home": {}},
                "odds": [
                    {
                        "quarter": 1,
                        "time": "10:00",
                        "awayWinProb": 0.52,
                        "source": "midpoint",
                        "marketTicker": "KXNBAGAME-26APR04DETPHI-DET",
                        "eventTicker": "KXNBAGAME-26APR04DETPHI",
                    }
                ],
            },
        }
        play_payload = {
            "game": {
                "homeTeamId": 1610612755,
                "awayTeamId": 1610612765,
                "actions": [
                    {
                        "actionNumber": 10,
                        "period": 1,
                        "clock": "PT10M00.00S",
                        "scoreHome": "0",
                        "scoreAway": "2",
                        "timeActual": "2026-04-03T03:00:00Z",
                    },
                    {
                        "actionNumber": 11,
                        "period": 1,
                        "clock": "PT09M40.00S",
                        "scoreHome": "0",
                        "scoreAway": "4",
                        "timeActual": "2026-04-03T03:01:00Z",
                    },
                    {
                        "actionNumber": 12,
                        "period": 1,
                        "clock": "PT09M10.00S",
                        "scoreHome": "2",
                        "scoreAway": "4",
                        "timeActual": "2026-04-03T03:02:00Z",
                    },
                ],
            }
        }
        box_payload = {
            "game": {
                "gameStatusText": "Q1 09:10",
                "gameClock": "PT09M10.00S",
                "homeTeam": {
                    "teamId": 1610612755,
                    "teamTricode": "PHI",
                    "score": 2,
                    "wins": 0,
                    "losses": 0,
                    "players": [],
                },
                "awayTeam": {
                    "teamId": 1610612765,
                    "teamTricode": "DET",
                    "score": 4,
                    "wins": 0,
                    "losses": 0,
                    "players": [],
                },
            }
        }
        processed_flow = {
            "v": 2,
            "periods": 4,
            "last": {"quarter": 1, "time": "09:10", "seq": 12, "awayScore": 4, "homeScore": 2},
            "score": [],
            "players": {"away": {}, "home": {}},
            "segments": {"away": {}, "home": {}},
        }

        def fake_fetch(url, _etag=None, _ua=None):
            if "playbyplay" in url:
                return play_payload, "play-etag"
            if "boxscore" in url:
                return box_payload, "box-etag"
            return None, None

        self.module.fetch_nba_data_urllib = fake_fetch
        self.module.fetch_kalshi_event_markets = MagicMock(
            return_value=[
                {
                    "ticker": "KXNBAGAME-26APR04DETPHI-DET",
                    "yes_bid_dollars": "0.5800",
                    "yes_ask_dollars": "0.6000",
                    "last_price_dollars": "0.5900",
                }
            ]
        )
        self.module.fetch_kalshi_market_candlesticks = MagicMock(
            return_value=[
                {
                    "end_period_ts": 1775185260,
                    "yes_bid": {"close_dollars": "0.5600"},
                    "yes_ask": {"close_dollars": "0.5800"},
                    "price": {"close_dollars": "0.5700", "previous_dollars": "0.5200"},
                },
                {
                    "end_period_ts": 1775185320,
                    "yes_bid": {"close_dollars": "0.5800"},
                    "yes_ask": {"close_dollars": "0.6000"},
                    "price": {"close_dollars": "0.5900", "previous_dollars": "0.5700"},
                },
            ]
        )
        self.module.process_playbyplay_payload = MagicMock(return_value=processed_flow)
        self.module.build_box_payload = MagicMock(
            return_value={
                "teams": {
                    "away": {"abbr": "DET", "players": []},
                    "home": {"abbr": "PHI", "players": []},
                }
            }
        )
        self.module.load_gamepack = MagicMock(return_value=existing_gamepack)
        self.module.upload_json_to_s3 = MagicMock()
        self.module.GEMINI_API_KEY = ""

        is_final, updates = self.module.process_game(game_item, user_agent="ua", date_str="2026-04-04")

        assert is_final is False
        assert updates["play_etag"] == "play-etag"
        assert updates["box_etag"] == "box-etag"
        uploaded_payload = self.module.upload_json_to_s3.call_args.kwargs["data"]
        assert uploaded_payload["flow"]["odds"] == [
            {
                "quarter": 1,
                "time": "10:00",
                "awayWinProb": 0.52,
                "source": "midpoint",
                "marketTicker": "KXNBAGAME-26APR04DETPHI-DET",
                "eventTicker": "KXNBAGAME-26APR04DETPHI",
            },
            {
                "quarter": 1,
                "time": "0940.00",
                "awayWinProb": 0.57,
                "source": "midpoint",
                "marketTicker": "KXNBAGAME-26APR04DETPHI-DET",
                "eventTicker": "KXNBAGAME-26APR04DETPHI",
            },
            {
                "quarter": 1,
                "time": "0910.00",
                "awayWinProb": 0.59,
                "source": "midpoint",
                "marketTicker": "KXNBAGAME-26APR04DETPHI-DET",
                "eventTicker": "KXNBAGAME-26APR04DETPHI",
            },
        ]

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
