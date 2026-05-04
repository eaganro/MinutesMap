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

    def test_reconcile_recent_schedule_targets_previous_four_days_today_and_next_seven_days(self):
        self.module.SCHEDULE_RECONCILE_DAYS = "4"
        self.module.SCHEDULE_RECONCILE_FUTURE_DAYS = "7"
        self.module.get_nba_date = MagicMock(return_value="2025-01-01")
        feed = {"gameDates": []}
        self.module.fetch_schedule_feed = MagicMock(return_value=feed)
        self.module.build_schedule_feed_map = MagicMock(
            return_value={
                "2024-12-28": {"2024-12-28-dal-hou": {"id": "2024-12-28-dal-hou"}},
                "2024-12-29": {"2024-12-29-bos-nyk": {"id": "2024-12-29-bos-nyk"}},
                "2024-12-30": {"2024-12-30-atl-orl": {"id": "2024-12-30-atl-orl"}},
                "2024-12-31": {"2024-12-31-phx-sac": {"id": "2024-12-31-phx-sac"}},
                "2025-01-01": {"2025-01-01-bos-nyk": {"id": "2025-01-01-bos-nyk"}},
                "2025-01-03": {"2025-01-03-lal-den": {"id": "2025-01-03-lal-den"}},
                "2025-01-07": {"2025-01-07-mia-chi": {"id": "2025-01-07-mia-chi"}},
                "2025-01-08": {"2025-01-08-min-okc": {"id": "2025-01-08-min-okc"}},
            }
        )
        self.module.reconcile_schedule_date = MagicMock(return_value=False)
        self.module.build_game_id_map_from_feed = MagicMock(return_value={})
        self.module.upload_game_id_map = MagicMock()

        self.module.reconcile_recent_schedule()

        expected_dates = [
            "2024-12-28",
            "2024-12-29",
            "2024-12-30",
            "2024-12-31",
            "2025-01-01",
            "2025-01-02",
            "2025-01-03",
            "2025-01-04",
            "2025-01-05",
            "2025-01-06",
            "2025-01-07",
            "2025-01-08",
        ]
        actual_dates = [
            call.args[0]
            for call in self.module.reconcile_schedule_date.call_args_list
        ]
        assert actual_dates == expected_dates
        assert self.module.build_game_id_map_from_feed.call_count == 12

    def test_reconcile_schedule_date_replaces_future_tbd_time_from_feed(self):
        self.module.get_games_from_s3 = MagicMock(
            return_value=[
                {
                    "id": "2026-05-01-nyk-bos",
                    "date": "2026-05-01",
                    "starttime": "2026-05-01T00:00:00",
                    "hometeam": "BOS",
                    "awayteam": "NYK",
                    "homescore": 0,
                    "awayscore": 0,
                    "status": "TBD",
                    "time": "TBD",
                    "box_etag": "box-etag",
                    "nbaGameId": "0042500123",
                }
            ]
        )
        self.module.upload_schedule_s3 = MagicMock()

        changed = self.module.reconcile_schedule_date(
            "2026-05-01",
            {
                "2026-05-01-nyk-bos": {
                    "id": "2026-05-01-nyk-bos",
                    "date": "2026-05-01",
                    "starttime": "2026-05-01T19:30:00",
                    "hometeam": "BOS",
                    "awayteam": "NYK",
                    "homescore": 0,
                    "awayscore": 0,
                    "status": "7:30 PM ET",
                    "time": "",
                    "seasonType": "playoffs",
                }
            },
        )

        assert changed is True
        uploaded = self.module.upload_schedule_s3.call_args.kwargs["games_list"]
        assert uploaded == [
            {
                "id": "2026-05-01-nyk-bos",
                "date": "2026-05-01",
                "starttime": "2026-05-01T19:30:00",
                "hometeam": "BOS",
                "awayteam": "NYK",
                "homescore": 0,
                "awayscore": 0,
                "status": "7:30 PM ET",
                "time": "",
                "box_etag": "box-etag",
                "seasonType": "playoffs",
            }
        ]

    def test_reconcile_schedule_date_keeps_final_state_when_feed_regresses(self):
        self.module.get_games_from_s3 = MagicMock(
            return_value=[
                {
                    "id": "2026-05-01-nyk-bos",
                    "date": "2026-05-01",
                    "starttime": "2026-05-01T19:30:00",
                    "hometeam": "BOS",
                    "awayteam": "NYK",
                    "homescore": 101,
                    "awayscore": 99,
                    "status": "Final",
                    "time": "",
                    "finalConfirmed": True,
                }
            ]
        )
        self.module.upload_schedule_s3 = MagicMock()

        changed = self.module.reconcile_schedule_date(
            "2026-05-01",
            {
                "2026-05-01-nyk-bos": {
                    "id": "2026-05-01-nyk-bos",
                    "date": "2026-05-01",
                    "starttime": "2026-05-01T19:30:00",
                    "hometeam": "BOS",
                    "awayteam": "NYK",
                    "homescore": 0,
                    "awayscore": 0,
                    "status": "Scheduled",
                    "time": "",
                }
            },
        )

        assert changed is False
        self.module.upload_schedule_s3.assert_not_called()

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

    def test_process_game_updates_page_artifacts_after_confirmed_final_upload(self):
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
                "gameStatusText": "Final",
                "gameClock": "",
                "homeTeam": {
                    "teamId": 1610612747,
                    "teamTricode": "LAL",
                    "score": 104,
                    "wins": 10,
                    "losses": 5,
                    "players": [],
                },
                "awayTeam": {
                    "teamId": 1610612755,
                    "teamTricode": "PHI",
                    "score": 118,
                    "wins": 12,
                    "losses": 3,
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

        self.module.fetch_nba_data_urllib = fake_fetch
        self.module.process_playbyplay_payload = MagicMock(return_value={"v": 2, "players": {"away": {}, "home": {}}, "segments": {"away": {}, "home": {}}, "last": {"awayScore": 118, "homeScore": 104}})
        self.module.build_box_payload = MagicMock(return_value={"start": "2026-02-04T00:00:00Z", "teams": {"away": {"id": 1610612755, "abbr": "PHI", "name": "76ers", "players": []}, "home": {"id": 1610612747, "abbr": "LAL", "name": "Lakers", "players": []}}})
        self.module.upload_json_to_s3 = MagicMock()
        artifact_result = {
            "gameId": "2026-02-04-phi-lal",
            "teamFiles": 2,
            "playerFiles": 0,
            "teams": ["PHI", "LAL"],
            "players": [],
        }
        self.module.update_page_artifacts_for_gamepack = MagicMock(return_value=artifact_result)
        self.module.request_minutesmap_revalidation = MagicMock()
        self.module.load_gamepack = MagicMock(return_value=None)

        is_final, updates = self.module.process_game(game_item, user_agent="ua", date_str="2026-02-04")

        assert is_final is True
        assert updates["status"] == "Final"
        assert updates["finalConfirmed"] is True
        self.module.upload_json_to_s3.assert_called_once()
        self.module.update_page_artifacts_for_gamepack.assert_called_once()
        self.module.request_minutesmap_revalidation.assert_called_once_with(artifact_result)
        uploaded_gamepack = self.module.upload_json_to_s3.call_args.kwargs["data"]
        assert uploaded_gamepack["seasonType"] == "regular"
        assert self.module.update_page_artifacts_for_gamepack.call_args.kwargs["gamepack"] == uploaded_gamepack

    def test_build_schedule_item_from_feed_adds_canonical_season_type(self):
        item = self.module.build_schedule_item_from_feed(
            game={
                "gameId": "0042500123",
                "gameStatusText": "Scheduled",
                "homeTeam": {"teamTricode": "BOS"},
                "awayTeam": {"teamTricode": "NYK"},
            },
            game_id="0042500123",
            date_str="2026-05-01",
            starttime="2026-05-01T19:30:00",
        )

        assert item["seasonType"] == "playoffs"

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

    def test_build_kalshi_odds_snapshot_uses_game7_series_fallback(self):
        self.module.fetch_kalshi_event_markets = MagicMock(
            side_effect=[
                [],
                [
                    {
                        "ticker": "KXNBASERIES-26TORCLER1-CLE",
                        "yes_bid_dollars": "0.7000",
                        "yes_ask_dollars": "0.7100",
                        "last_price_dollars": "0.7000",
                    },
                    {
                        "ticker": "KXNBASERIES-26TORCLER1-TOR",
                        "yes_bid_dollars": "0.2900",
                        "yes_ask_dollars": "0.3000",
                        "last_price_dollars": "0.3000",
                    },
                ],
            ]
        )
        self.module.fetch_kalshi_events = MagicMock(
            return_value=[
                {
                    "event_ticker": "KXNBASERIES-26TORCLER1",
                    "title": "Game 7: Toronto (5) vs Cleveland (4)",
                    "product_metadata": {"competition_scope": "Game"},
                }
            ]
        )

        snapshots = self.module.build_kalshi_odds_snapshot(
            game_item={
                "status": "Q1 10:00",
                "time": "10:00",
                "awayteam": "TOR",
                "hometeam": "CLE",
            },
            box_game={
                "gameStatusText": "Q1 10:00",
                "gameClock": "PT10M00.00S",
                "awayTeam": {"teamTricode": "TOR"},
                "homeTeam": {"teamTricode": "CLE"},
            },
            last_action={"period": 1, "clock": "PT10M00.00S"},
            existing_flow=None,
            actions=[],
            date_str="2026-05-03",
            user_agent="ua",
        )

        assert snapshots == [
            {
                "quarter": 1,
                "time": "1000.00",
                "awayWinProb": 0.295,
                "source": "series-game7-midpoint",
                "marketTicker": "KXNBASERIES-26TORCLER1-TOR",
                "eventTicker": "KXNBASERIES-26TORCLER1",
            }
        ]
        assert self.module.fetch_kalshi_event_markets.call_args_list[0].args[0] == "KXNBAGAME-26MAY03TORCLE"
        assert self.module.fetch_kalshi_event_markets.call_args_list[1].args[0] == "KXNBASERIES-26TORCLER1"

    def test_build_kalshi_odds_snapshot_ignores_non_game7_series_fallback(self):
        self.module.fetch_kalshi_event_markets = MagicMock(return_value=[])
        self.module.fetch_kalshi_events = MagicMock(
            return_value=[
                {
                    "event_ticker": "KXNBASERIES-26TORCLER1",
                    "title": "Series Winner: Toronto (5) vs Cleveland (4)",
                    "product_metadata": {"competition_scope": "Series Winner"},
                }
            ]
        )

        snapshots = self.module.build_kalshi_odds_snapshot(
            game_item={
                "status": "Q1 10:00",
                "time": "10:00",
                "awayteam": "TOR",
                "hometeam": "CLE",
            },
            box_game={
                "gameStatusText": "Q1 10:00",
                "gameClock": "PT10M00.00S",
                "awayTeam": {"teamTricode": "TOR"},
                "homeTeam": {"teamTricode": "CLE"},
            },
            last_action={"period": 1, "clock": "PT10M00.00S"},
            existing_flow=None,
            actions=[],
            date_str="2026-05-03",
            user_agent="ua",
        )

        assert snapshots == []
        self.module.fetch_kalshi_event_markets.assert_called_once_with(
            "KXNBAGAME-26MAY03TORCLE",
            user_agent="ua",
        )

    def test_resolve_odds_position_ignores_premature_zero_box_clock(self):
        position = self.module.resolve_odds_position(
            {
                "status": "Q2 00:00",
                "time": "0000.00",
            },
            box_game={
                "gameStatusText": "Q2 00:00",
                "gameClock": "PT00M00.00S",
            },
            last_action={
                "period": 2,
                "clock": "PT05M27.00S",
            },
        )

        assert position == {
            "quarter": 2,
            "time": "0527.00",
        }

    def test_resolve_odds_position_keeps_zero_when_play_feed_reaches_zero(self):
        position = self.module.resolve_odds_position(
            {
                "status": "Q2 00:00",
                "time": "0000.00",
            },
            box_game={
                "gameStatusText": "Q2 00:00",
                "gameClock": "PT00M00.00S",
            },
            last_action={
                "period": 2,
                "clock": "PT00M00.00S",
            },
        )

        assert position == {
            "quarter": 2,
            "time": "0000.00",
        }

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
