import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "functions" / "nba-game-poller"))

from nba_game_poller.gamepack_utils import build_box_payload, build_team_payload  # noqa: E402


def test_build_team_payload_excludes_zero_minute_players():
    team = {
        "teamId": 1610612755,
        "teamTricode": "PHI",
        "teamName": "76ers",
        "players": [
            {
                "personId": 1,
                "firstName": "Tyrese",
                "familyName": "Maxey",
                "statistics": {
                    "minutes": "33:42",
                    "points": 14,
                    "fieldGoalsMade": 5,
                    "fieldGoalsAttempted": 13,
                },
            },
            {
                "personId": 2,
                "firstName": "Charles",
                "familyName": "Bassey",
                "statistics": {
                    "minutes": "00:00",
                    "points": 0,
                    "fieldGoalsMade": 0,
                    "fieldGoalsAttempted": 0,
                },
            },
            {
                "personId": 3,
                "firstName": "Joel",
                "familyName": "Embiid",
                "statistics": {
                    "minutes": "PT31M00.00S",
                    "points": 24,
                    "fieldGoalsMade": 8,
                    "fieldGoalsAttempted": 15,
                },
            },
        ],
    }

    payload = build_team_payload(team)

    assert payload["abbr"] == "PHI"
    assert [player["id"] for player in payload["players"]] == [1, 3]
    assert [player["stats"]["min"] for player in payload["players"]] == ["33:42", "31:00"]


def test_build_box_payload_adds_canonical_season_type_from_game_id():
    payload = build_box_payload(
        {
            "gameId": "0052500001",
            "gameTimeUTC": "2026-04-15T23:00:00Z",
            "awayTeam": {"teamId": 1, "teamTricode": "ATL", "teamName": "Hawks", "players": []},
            "homeTeam": {"teamId": 2, "teamTricode": "MIA", "teamName": "Heat", "players": []},
        }
    )

    assert payload["seasonType"] == "play_in"
