import gzip
import io
import json
import sys
from datetime import date
from pathlib import Path

from botocore.exceptions import ClientError


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "functions" / "nba-game-poller"))

from nba_game_poller.page_artifacts import (  # noqa: E402
    _recalc_player_artifact,
    _recalc_team_artifact,
    update_team_live_artifacts_for_schedule_game,
    update_page_artifacts_for_gamepack,
)


class FakeS3:
    def __init__(self):
        self.objects = {}

    def get_object(self, *, Bucket, Key):
        value = self.objects.get((Bucket, Key))
        if value is None:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": io.BytesIO(value)}

    def put_object(self, *, Bucket, Key, Body, **_kwargs):
        self.objects[(Bucket, Key)] = Body


def test_update_page_artifacts_for_gamepack_writes_team_and_player_files():
    s3 = FakeS3()
    gamepack = {
        "v": 1,
        "id": "0022500003",
        "publicId": "2026-02-03-phi-gsw",
        "box": {
            "start": "2026-02-03T22:10:00Z",
            "teams": {
                "away": {
                    "id": 1610612755,
                    "abbr": "PHI",
                    "name": "76ers",
                    "players": [
                        {
                            "id": 201939,
                            "first": "Tyrese",
                            "last": "Maxey",
                            "stats": {
                                "min": "34:12",
                                "pts": 27,
                                "fgm": 10,
                                "fga": 18,
                                "tpm": 3,
                                "tpa": 7,
                                "ftm": 4,
                                "fta": 4,
                                "oreb": 1,
                                "dreb": 3,
                                "ast": 6,
                                "stl": 2,
                                "blk": 0,
                                "to": 2,
                                "pf": 2,
                                "pm": 8,
                            },
                        }
                    ],
                },
                "home": {
                    "id": 1610612744,
                    "abbr": "GSW",
                    "name": "Warriors",
                    "players": [
                        {
                            "id": 2019399,
                            "first": "Stephen",
                            "last": "Curry",
                            "stats": {
                                "min": "35:05",
                                "pts": 29,
                                "fgm": 11,
                                "fga": 21,
                                "tpm": 5,
                                "tpa": 12,
                                "ftm": 2,
                                "fta": 2,
                                "oreb": 0,
                                "dreb": 4,
                                "ast": 7,
                                "stl": 1,
                                "blk": 0,
                                "to": 4,
                                "pf": 1,
                                "pm": -3,
                            },
                        }
                    ],
                },
            },
        },
        "flow": {
            "v": 2,
            "last": {
                "quarter": 4,
                "time": "00.00",
                "awayScore": 112,
                "homeScore": 108,
            },
            "players": {
                "away": {
                    "T. Maxey": [
                        {
                            "quarter": 1,
                            "time": "11:32",
                            "type": "2pt",
                            "text": "T. Maxey make 2pt layup",
                            "seq": 1,
                            "r": "m",
                        }
                    ]
                },
                "home": {
                    "S. Curry": [
                        {
                            "quarter": 1,
                            "time": "09:50",
                            "type": "3pt",
                            "text": "S. Curry make 3pt jumper",
                            "seq": 10,
                            "r": "m",
                        }
                    ]
                },
            },
            "segments": {
                "away": {"T. Maxey": [{"quarter": 1, "start": "12:00", "end": "06:00"}]},
                "home": {"S. Curry": [{"quarter": 1, "start": "12:00", "end": "00:00"}]},
            },
        },
    }

    result = update_page_artifacts_for_gamepack(
        s3_client=s3,
        bucket="test-bucket",
        root_prefix="data/",
        page_prefix="pages/",
        gamepack=gamepack,
    )

    assert result == {
        "teamFiles": 2,
        "playerFiles": 2,
        "teams": ["PHI", "GSW"],
        "players": [201939, 2019399],
        "gameId": "2026-02-03-phi-gsw",
        "season": "2025-26",
        "seasonType": "regular",
    }

    player_key = ("test-bucket", "data/pages/players/201939/2025-26.json.gz")
    player_artifact = json.loads(gzip.decompress(s3.objects[player_key]).decode("utf-8"))
    assert player_artifact["player"]["name"] == "Tyrese Maxey"
    assert player_artifact["games"][0]["gameId"] == "2026-02-03-phi-gsw"
    assert player_artifact["games"][0]["seasonType"] == "regular"
    assert player_artifact["bySeasonType"]["regular"]["totals"]["games"] == 1
    assert player_artifact["bySeasonType"]["regular"]["averages"]["box"]["pts"] == 27.0
    assert len(player_artifact["games"][0]["detail"]["actions"]) == 1
    assert len(player_artifact["games"][0]["detail"]["segments"]) == 1

    team_key = ("test-bucket", "data/pages/teams/PHI/2025-26.json.gz")
    team_artifact = json.loads(gzip.decompress(s3.objects[team_key]).decode("utf-8"))
    assert team_artifact["team"]["abbr"] == "PHI"
    assert team_artifact["games"][0]["gameId"] == "2026-02-03-phi-gsw"
    assert team_artifact["games"][0]["seasonType"] == "regular"
    assert team_artifact["games"][0]["recordAfterBySeasonType"] == {"wins": 1, "losses": 0, "ties": 0}
    assert team_artifact["bySeasonType"]["regular"]["record"] == {"wins": 1, "losses": 0, "ties": 0}
    assert team_artifact["bySeasonType"]["regular"]["averages"]["pointsFor"] == 112.0
    assert len(team_artifact["players"]) == 1
    assert team_artifact["players"][0]["playerId"] == 201939
    assert team_artifact["players"][0]["name"] == "Tyrese Maxey"
    assert team_artifact["players"][0]["games"] == 1
    assert team_artifact["players"][0]["box"]["pts"] == 27


def test_update_team_live_artifacts_for_schedule_game_writes_team_files_only():
    s3 = FakeS3()
    schedule_game = {
        "id": "2026-02-04-phi-lal",
        "nbaGameId": "0022500001",
        "date": "2026-02-04",
        "starttime": "2026-02-04T19:30:00-05:00",
        "awayteam": "PHI",
        "hometeam": "LAL",
        "awayTeamId": 1610612755,
        "homeTeamId": 1610612747,
        "awayscore": 18,
        "homescore": 14,
        "status": "Q1 06:12",
        "time": "06:12",
        "seasonType": "regular",
    }

    result = update_team_live_artifacts_for_schedule_game(
        s3_client=s3,
        bucket="test-bucket",
        root_prefix="data/",
        page_prefix="pages/",
        schedule_game=schedule_game,
    )

    assert result == {
        "teamFiles": 2,
        "playerFiles": 0,
        "teams": ["PHI", "LAL"],
        "players": [],
        "gameId": "2026-02-04-phi-lal",
        "season": "2025-26",
        "seasonType": "regular",
    }
    assert sorted(key for _, key in s3.objects) == [
        "data/pages/teams/LAL/2025-26.json.gz",
        "data/pages/teams/PHI/2025-26.json.gz",
    ]

    team_key = ("test-bucket", "data/pages/teams/PHI/2025-26.json.gz")
    team_artifact = json.loads(gzip.decompress(s3.objects[team_key]).decode("utf-8"))
    live_row = team_artifact["games"][0]
    assert live_row["status"] == "Q1 06:12"
    assert live_row["played"] is False
    assert live_row["result"] is None
    assert live_row["teamScore"] == 18
    assert live_row["oppScore"] == 14
    assert live_row["gamepackKey"] == "data/gamepack/2026-02-04-phi-lal.json.gz"
    assert live_row["recordAfterBySeasonType"] is None
    assert team_artifact["record"] == {"wins": 0, "losses": 0, "ties": 0}
    assert team_artifact["players"] == []


def test_team_recalc_keeps_future_unplayed_schedule_rows_out_of_totals():
    artifact = {
        "games": [
            {
                "gameId": "2026-02-03-phi-gsw",
                "nbaGameId": "0022500003",
                "date": "2026-02-03",
                "start": "2026-02-03T22:10:00Z",
                "seasonType": "regular",
                "result": "W",
                "teamScore": 112,
                "oppScore": 108,
                "teamStats": {"pts": 112, "seconds": 14400},
                "players": [{"playerId": 201939, "name": "Tyrese Maxey", "box": {"pts": 27}}],
            },
            {
                "gameId": "2099-02-10-phi-lal",
                "nbaGameId": "0022500100",
                "date": "2099-02-10",
                "start": "2099-02-10T22:00:00Z",
                "seasonType": "regular",
                "status": "Scheduled",
                "played": False,
                "result": None,
                "teamScore": 0,
                "oppScore": 0,
                "teamStats": {},
                "players": [],
            },
        ]
    }

    _recalc_team_artifact(artifact, today=date(2026, 5, 7))

    assert artifact["record"] == {"wins": 1, "losses": 0, "ties": 0}
    assert len(artifact["games"]) == 2
    assert artifact["games"][1]["recordAfter"] == {"wins": 1, "losses": 0, "ties": 0}
    assert artifact["games"][1]["recordAfterBySeasonType"] is None
    assert artifact["bySeasonType"]["regular"]["games"] == 1
    assert artifact["averages"]["pointsFor"] == 112.0
    assert artifact["players"][0]["games"] == 1


def test_team_recalc_removes_stale_unplayed_schedule_rows():
    artifact = {
        "games": [
            {
                "gameId": "2026-02-03-phi-gsw",
                "nbaGameId": "0022500003",
                "date": "2026-02-03",
                "start": "2026-02-03T22:10:00Z",
                "seasonType": "regular",
                "result": "W",
                "teamScore": 112,
                "oppScore": 108,
                "teamStats": {"pts": 112, "seconds": 14400},
                "players": [{"playerId": 201939, "name": "Tyrese Maxey", "box": {"pts": 27}}],
            },
            {
                "gameId": "2026-04-28-lal-den",
                "nbaGameId": "0042500157",
                "date": "2026-04-28",
                "start": "2026-04-28T02:00:00Z",
                "seasonType": "playoffs",
                "status": "Scheduled",
                "played": False,
                "result": None,
                "teamScore": 0,
                "oppScore": 0,
                "teamStats": {},
                "players": [],
            },
        ]
    }

    _recalc_team_artifact(artifact, today=date(2026, 5, 7))

    assert [game["gameId"] for game in artifact["games"]] == ["2026-02-03-phi-gsw"]
    assert artifact["record"] == {"wins": 1, "losses": 0, "ties": 0}
    assert "playoffs" not in artifact["bySeasonType"]


def test_player_recalc_removes_stale_unplayed_rows():
    artifact = {
        "games": [
            {
                "gameId": "2026-02-03-phi-gsw",
                "nbaGameId": "0022500003",
                "date": "2026-02-03",
                "start": "2026-02-03T22:10:00Z",
                "seasonType": "regular",
                "result": "W",
                "teamScore": 112,
                "oppScore": 108,
                "teamId": 1610612755,
                "teamAbbr": "PHI",
                "teamName": "76ers",
                "box": {"seconds": 2052, "pts": 27},
            },
            {
                "gameId": "2026-04-28-lal-den",
                "nbaGameId": "0042500157",
                "date": "2026-04-28",
                "start": "2026-04-28T02:00:00Z",
                "seasonType": "playoffs",
                "status": "Scheduled",
                "played": False,
                "result": None,
                "teamScore": 0,
                "oppScore": 0,
                "teamId": 1610612747,
                "teamAbbr": "LAL",
                "teamName": "Lakers",
                "box": {},
                "detail": {"actions": [], "segments": []},
            },
        ]
    }

    _recalc_player_artifact(artifact, today=date(2026, 5, 7))

    assert [game["gameId"] for game in artifact["games"]] == ["2026-02-03-phi-gsw"]
    assert artifact["totals"]["games"] == 1
    assert artifact["totals"]["box"]["pts"] == 27
    assert artifact["teams"] == [{"id": 1610612755, "abbr": "PHI", "name": "76ers"}]
