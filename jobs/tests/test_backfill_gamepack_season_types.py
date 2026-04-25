import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "jobs"))

import backfill_gamepack_season_types as module  # noqa: E402


def test_patch_gamepack_season_type_adds_top_level_and_box_fields():
    result = module.patch_gamepack_season_type(
        {
            "v": 1,
            "id": "0042500123",
            "publicId": "2026-05-01-nyk-bos",
            "box": {"teams": {}},
        }
    )

    assert result["changed"] is True
    assert result["seasonType"] == "playoffs"
    assert result["gamepack"]["seasonType"] == "playoffs"
    assert result["gamepack"]["box"]["seasonType"] == "playoffs"


def test_patch_gamepack_season_type_is_idempotent_when_fields_match():
    result = module.patch_gamepack_season_type(
        {
            "v": 1,
            "id": "0022500001",
            "seasonType": "regular",
            "box": {"seasonType": "regular", "teams": {}},
        }
    )

    assert result["changed"] is False
    assert result["gamepack"]["seasonType"] == "regular"


def test_patch_gamepack_season_type_normalizes_existing_label():
    result = module.patch_gamepack_season_type(
        {
            "v": 1,
            "id": "abc",
            "seasonType": "Play-In",
            "box": {"teams": {}},
        }
    )

    assert result["changed"] is True
    assert result["seasonType"] == "play_in"
    assert result["gamepack"]["seasonType"] == "play_in"
