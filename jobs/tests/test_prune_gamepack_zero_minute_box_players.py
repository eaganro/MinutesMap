import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "jobs"))

import prune_gamepack_zero_minute_box_players as module  # noqa: E402


def test_prune_zero_minute_players_removes_only_box_players_with_zero_minutes():
    gamepack = {
        "publicId": "2026-01-26-phi-cha",
        "box": {
            "teams": {
                "away": {
                    "abbr": "PHI",
                    "players": [
                        {"first": "Tyrese", "last": "Maxey", "stats": {"min": "33:42"}},
                        {"first": "Charles", "last": "Bassey", "stats": {"min": "00:00"}},
                        {"first": "Joel", "last": "Embiid", "stats": {"min": "31:00"}},
                    ],
                },
                "home": {
                    "abbr": "CHA",
                    "players": [
                        {"first": "LaMelo", "last": "Ball", "stats": {"min": "35:01"}},
                        {"first": "Bench", "last": "Guy", "stats": {"min": "00:00"}},
                    ],
                },
            }
        },
    }

    result = module.prune_zero_minute_players(gamepack)

    assert result["removed"] == 2
    away_players = result["gamepack"]["box"]["teams"]["away"]["players"]
    home_players = result["gamepack"]["box"]["teams"]["home"]["players"]
    assert [f"{p['first']} {p['last']}" for p in away_players] == ["Tyrese Maxey", "Joel Embiid"]
    assert [f"{p['first']} {p['last']}" for p in home_players] == ["LaMelo Ball"]
