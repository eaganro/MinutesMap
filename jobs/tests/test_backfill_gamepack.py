import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "jobs"))

import backfill_gamepack as module  # noqa: E402


def test_fetch_mode_defaults_to_curl(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["backfill_gamepack.py", "--date", "2024-11-15"])
    assert module.parse_args().fetch_mode == "curl"
    assert module.fetch_mode == "curl"


def test_fetches_go_through_the_selected_mode(monkeypatch):
    calls = []

    def fake(name):
        def fetch(url, etag=None, user_agent=None):
            calls.append((name, url))
            return None, None

        return fetch

    monkeypatch.setattr(module, "FETCHERS", {"curl": fake("curl"), "urllib": fake("urllib")})

    monkeypatch.setattr(module, "fetch_mode", "curl")
    assert module.backfill_gamepack_for_game("2024-11-15-det-tor", "0022400011", None, "bucket", "data/") is False
    assert [name for name, _ in calls] == ["curl", "curl"]
    assert calls[0][1].endswith("playbyplay_0022400011.json")
    assert calls[1][1].endswith("boxscore_0022400011.json")

    calls.clear()
    monkeypatch.setattr(module, "fetch_mode", "urllib")
    module.load_games_from_feed("2024-11-15")
    assert calls == [("urllib", module.SCHEDULE_FEED_URL)]
