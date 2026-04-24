import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "jobs"))

import player_id_registry as module  # noqa: E402


def test_registry_serialization_round_trip():
    registry = {
        "byTeamName": {
            ("PHI", "tyrese maxey"): 201939,
            ("GSW", "stephen curry"): 2019399,
        },
        "uniqueByName": {
            "joel embiid": 203954,
        },
    }

    payload = module.serialize_registry(registry, season="2025-26")
    restored = module.deserialize_registry(payload)

    assert payload["season"] == "2025-26"
    assert restored == registry


def test_resolve_player_id_prefers_team_name_match_then_unique_name():
    registry = {
        "byTeamName": {
            ("PHI", "tyrese maxey"): 201939,
        },
        "uniqueByName": {
            "joel embiid": 203954,
        },
    }

    assert module.resolve_player_id(
        {"first": "Tyrese", "last": "Maxey"},
        "PHI",
        registry,
    ) == 201939
    assert module.resolve_player_id(
        {"first": "Joel", "last": "Embiid"},
        "PHI",
        registry,
    ) == 203954
