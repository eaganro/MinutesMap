import json

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


def test_parse_json_payload_extracts_first_json_object_from_wrapped_text():
    raw_text = (
        "Sure, here is the result.\n"
        '{"full_caption":"Away team closes Q1 strong.","player_stories":[]}\n'
        "Hope this helps."
    )

    parsed = captioning._parse_json_payload(raw_text)

    assert parsed["full_caption"] == "Away team closes Q1 strong."
    assert parsed["player_stories"] == []


def test_parse_json_payload_handles_fenced_json():
    raw_text = (
        "```json\n"
        '{"full_caption":"Game stays tight through halftime.","player_stories":[]}\n'
        "```"
    )

    parsed = captioning._parse_json_payload(raw_text)

    assert parsed["full_caption"] == "Game stays tight through halftime."
    assert parsed["player_stories"] == []


def test_request_period_caption_includes_response_schema(monkeypatch):
    flow_payload = {
        "score": [{"quarter": 1, "awayScore": 28, "homeScore": 24}],
        "players": {"away": {}, "home": {}},
        "events": [],
    }
    box_payload = {
        "teams": {
            "away": {"abbr": "DAL"},
            "home": {"abbr": "MIN"},
        }
    }

    captured = {}

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps(
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": '{"full_caption":"DAL leads after one.","player_stories":[]}'
                                    }
                                ]
                            }
                        }
                    ]
                }
            ).encode("utf-8")

    def fake_urlopen(req, timeout=8.0):
        captured["timeout"] = timeout
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _FakeResponse()

    monkeypatch.setattr(captioning.urllib.request, "urlopen", fake_urlopen)

    generated = captioning.request_period_caption(
        flow_payload=flow_payload,
        box_payload=box_payload,
        period=1,
        api_key="test-api-key",
        model="gemini-2.5-flash",
        max_players_per_team=2,
        timeout_seconds=7.0,
    )

    assert generated == {"full": "DAL leads after one.", "players": []}

    generation_config = captured["body"]["generationConfig"]
    assert generation_config["responseMimeType"] == "application/json"
    assert generation_config["responseSchema"]["type"] == "object"
    assert generation_config["responseSchema"]["properties"]["player_stories"]["type"] == "array"
