from nba_game_poller import captioning


def test_extract_closed_periods_handles_transitions_and_period_end():
    assert captioning.extract_closed_periods(
        [
            {"period": 1, "clock": "PT00M10.00S"},
            {"period": 2, "clock": "PT11M58.00S"},
        ]
    ) == [1]

    assert captioning.extract_closed_periods(
        [
            {"period": 1, "clock": "PT00M10.00S"},
            {"period": 2, "clock": "PT00M00.00S"},
        ]
    ) == [1, 2]


def test_build_period_captions_merges_existing_checkpoints(monkeypatch):
    existing = {
        "v": 1,
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "periods": {
            "1": {
                "generatedAt": "2026-02-01T00:00:00+00:00",
                "full": "Existing first-quarter caption.",
                "players": [],
            }
        },
    }
    flow_payload = {
        "score": [
            {"quarter": 1, "awayScore": 26, "homeScore": 23},
            {"quarter": 2, "awayScore": 50, "homeScore": 49},
        ],
        "players": {"away": {}, "home": {}},
        "events": [],
    }
    box_payload = {
        "teams": {
            "away": {"abbr": "PHI"},
            "home": {"abbr": "LAL"},
        }
    }
    actions = [
        {"period": 1, "clock": "PT00M00.00S"},
        {"period": 2, "clock": "PT00M00.00S"},
    ]

    def fake_request_period_caption(**kwargs):
        period = kwargs.get("period")
        return {"full": f"Generated for period {period}.", "players": []}

    monkeypatch.setattr(captioning, "request_period_caption", fake_request_period_caption)

    merged = captioning.build_period_captions(
        actions=actions,
        flow_payload=flow_payload,
        box_payload=box_payload,
        existing_captions=existing,
        api_key="test-key",
        model="gemini-2.5-flash",
    )

    assert merged["periods"]["1"]["full"] == "Existing first-quarter caption."
    assert merged["periods"]["2"]["full"] == "Generated for period 2."


def test_build_period_captions_can_detect_closed_periods_from_flow(monkeypatch):
    flow_payload = {
        "last": {"quarter": 2, "time": "00:00"},
        "score": [
            {"quarter": 1, "awayScore": 26, "homeScore": 23},
            {"quarter": 2, "awayScore": 50, "homeScore": 49},
        ],
        "players": {"away": {}, "home": {}},
        "events": [],
    }
    box_payload = {
        "teams": {
            "away": {"abbr": "PHI"},
            "home": {"abbr": "LAL"},
        }
    }

    def fake_request_period_caption(**kwargs):
        period = kwargs.get("period")
        return {"full": f"Generated for period {period}.", "players": []}

    monkeypatch.setattr(captioning, "request_period_caption", fake_request_period_caption)

    merged = captioning.build_period_captions(
        actions=None,
        flow_payload=flow_payload,
        box_payload=box_payload,
        existing_captions=None,
        api_key="test-key",
        model="gemini-2.5-flash",
    )

    assert merged["periods"]["1"]["full"] == "Generated for period 1."
    assert merged["periods"]["2"]["full"] == "Generated for period 2."
