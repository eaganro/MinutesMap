import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "jobs"))

import repair_gamepack_player_ids as module  # noqa: E402


def make_gamepack(game_id, away_players, home_players):
    return {
        "publicId": game_id,
        "box": {
            "teams": {
                "away": {"abbr": "PHI", "players": away_players},
                "home": {"abbr": "GSW", "players": home_players},
            }
        },
    }


def test_patch_gamepack_player_ids_recovers_ids_from_registry():
    source = make_gamepack(
        "2026-01-21-phi-gsw",
        away_players=[
            {"id": 1, "first": "Tyrese", "last": "Maxey"},
            {"id": 2, "first": "Joel", "last": "Embiid"},
        ],
        home_players=[
            {"id": 30, "first": "Stephen", "last": "Curry"},
            {"id": 23, "first": "Draymond", "last": "Green"},
        ],
    )
    target = make_gamepack(
        "2026-01-22-phi-gsw",
        away_players=[
            {"first": "Tyrese", "last": "Maxey"},
            {"first": "Joel", "last": "Embiid"},
            {"first": "Unknown", "last": "Player"},
        ],
        home_players=[
            {"first": "Stephen", "last": "Curry"},
            {"first": "Draymond", "last": "Green"},
        ],
    )

    registry = module.build_identity_registry([source, target])
    result = module.patch_gamepack_player_ids(target, registry)

    assert result["changed"] == 4
    away_players = result["gamepack"]["box"]["teams"]["away"]["players"]
    home_players = result["gamepack"]["box"]["teams"]["home"]["players"]
    assert away_players[0]["id"] == 1
    assert away_players[1]["id"] == 2
    assert home_players[0]["id"] == 30
    assert home_players[1]["id"] == 23
    assert result["unresolved"] == [
        {"team": "PHI", "name": "Unknown Player", "slug": "unknown-player"}
    ]


def test_patch_gamepack_player_ids_keeps_existing_ids():
    gamepack = make_gamepack(
        "2026-01-21-phi-gsw",
        away_players=[{"id": 1, "first": "Tyrese", "last": "Maxey"}],
        home_players=[{"id": 30, "first": "Stephen", "last": "Curry"}],
    )

    registry = module.build_identity_registry([gamepack])
    result = module.patch_gamepack_player_ids(gamepack, registry)

    assert result["changed"] == 0
    assert result["unresolved"] == []
    assert result["gamepack"]["box"]["teams"]["away"]["players"][0]["id"] == 1
