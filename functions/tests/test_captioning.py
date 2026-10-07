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


def test_select_caption_checkpoint_periods_limits_generation_checkpoints():
    assert captioning.select_caption_checkpoint_periods([1, 2, 3]) == [2]
    assert captioning.select_caption_checkpoint_periods([1, 2, 3, 4]) == [2, 4]
    assert captioning.select_caption_checkpoint_periods([1, 2, 3, 4, 5]) == [2, 4]
    assert captioning.select_caption_checkpoint_periods(
        [1, 2, 3, 4, 5],
        include_final_overtime=True,
    ) == [2, 4, 5]
    assert captioning.select_caption_checkpoint_periods(
        [1, 2, 3, 4, 5, 6],
        include_final_overtime=True,
    ) == [2, 4, 6]


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

    requested_periods = []

    def fake_request_period_caption(**kwargs):
        period = kwargs.get("period")
        requested_periods.append(period)
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
    assert requested_periods == [2]
    assert merged["limits"] == {
        "full": captioning.FULL_CAPTION_MAX_CHARS,
        "player": captioning.PLAYER_CAPTION_MAX_CHARS,
    }


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

    assert merged["periods"]["2"]["full"] == "Generated for period 2."
    assert "1" not in merged["periods"]
    assert merged["limits"] == {
        "full": captioning.FULL_CAPTION_MAX_CHARS,
        "player": captioning.PLAYER_CAPTION_MAX_CHARS,
    }


def test_build_period_captions_only_generates_final_overtime_when_final(monkeypatch):
    flow_payload = {
        "last": {"quarter": 6, "time": "00:00"},
        "score": [
            {"quarter": 1, "awayScore": 26, "homeScore": 23},
            {"quarter": 2, "awayScore": 50, "homeScore": 49},
            {"quarter": 3, "awayScore": 74, "homeScore": 75},
            {"quarter": 4, "awayScore": 102, "homeScore": 102},
            {"quarter": 5, "awayScore": 112, "homeScore": 112},
            {"quarter": 6, "awayScore": 121, "homeScore": 118},
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
    requested_periods = []

    def fake_request_period_caption(**kwargs):
        period = kwargs.get("period")
        requested_periods.append(period)
        return {"full": f"Generated for period {period}.", "players": []}

    monkeypatch.setattr(captioning, "request_period_caption", fake_request_period_caption)

    merged = captioning.build_period_captions(
        actions=None,
        flow_payload=flow_payload,
        box_payload=box_payload,
        existing_captions=None,
        api_key="test-key",
        model="gemini-2.5-flash",
        include_final_overtime=True,
    )

    assert requested_periods == [2, 4, 6]
    assert set(merged["periods"].keys()) == {"2", "4", "6"}


def test_build_period_captions_defers_fourth_quarter_until_final(monkeypatch):
    flow_payload = {
        "last": {"quarter": 4, "time": "00:00"},
        "score": [
            {"quarter": 1, "awayScore": 28, "homeScore": 24},
            {"quarter": 2, "awayScore": 52, "homeScore": 50},
            {"quarter": 3, "awayScore": 80, "homeScore": 74},
            {"quarter": 4, "awayScore": 108, "homeScore": 101},
        ],
        "players": {"away": {}, "home": {}},
        "events": [],
    }
    box_payload = {
        "teams": {
            "away": {"abbr": "DAL"},
            "home": {"abbr": "MIN"},
        }
    }
    requested_periods = []
    existing_captions = {
        "v": 1,
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "updatedAt": "2026-02-01T00:00:00+00:00",
        "limits": {
            "full": captioning.FULL_CAPTION_MAX_CHARS,
            "player": captioning.PLAYER_CAPTION_MAX_CHARS,
        },
        "periods": {
            "2": {
                "generatedAt": "2026-02-01T00:00:00+00:00",
                "full": "Existing halftime caption.",
                "players": [],
            }
        },
    }

    def fake_request_period_caption(**kwargs):
        requested_periods.append(kwargs.get("period"))
        return {"full": f"Generated for period {kwargs.get('period')}.", "players": []}

    monkeypatch.setattr(captioning, "request_period_caption", fake_request_period_caption)

    deferred = captioning.build_period_captions(
        actions=None,
        flow_payload=flow_payload,
        box_payload=box_payload,
        existing_captions=existing_captions,
        api_key="test-key",
        model="gemini-2.5-flash",
        is_final_game=False,
    )
    final = captioning.build_period_captions(
        actions=None,
        flow_payload=flow_payload,
        box_payload=box_payload,
        existing_captions=existing_captions,
        api_key="test-key",
        model="gemini-2.5-flash",
        is_final_game=True,
    )

    assert deferred == existing_captions
    assert requested_periods == [4]
    assert final["periods"]["4"]["full"] == "Generated for period 4."


def test_filter_caption_checkpoints_allows_fourth_when_overtime_starts():
    flow_payload = {
        "last": {"quarter": 5, "time": "04:30"},
        "score": [
            {"quarter": 4, "awayScore": 104, "homeScore": 104},
            {"quarter": 5, "awayScore": 106, "homeScore": 104},
        ],
    }

    assert captioning.filter_caption_checkpoint_periods(
        [2, 4],
        flow_payload,
        is_final_game=False,
    ) == [2, 4]


def test_build_period_captions_normalizes_limits_even_when_no_new_periods():
    existing = {
        "v": 1,
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "updatedAt": "2026-02-01T00:00:00+00:00",
        "limits": {"full": 999, "player": 999},
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
        {"period": 2, "clock": "PT11M59.00S"},
    ]

    merged = captioning.build_period_captions(
        actions=actions,
        flow_payload=flow_payload,
        box_payload=box_payload,
        existing_captions=existing,
        api_key="test-key",
        model="gemini-2.5-flash",
    )

    assert merged["limits"] == {
        "full": captioning.FULL_CAPTION_MAX_CHARS,
        "player": captioning.PLAYER_CAPTION_MAX_CHARS,
    }


def test_parse_json_payload_extracts_first_json_object_from_wrapped_text():
    raw_text = (
        "Sure, here is the result.\n"
        '{"full_caption":"Away team closes Q1 strong.","player_stories":[]}\n'
        "Hope this helps."
    )

    parsed = captioning._parse_json_payload(raw_text)

    assert parsed["full_caption"] == "Away team closes Q1 strong."
    assert parsed["player_stories"] == []


def test_compute_player_metrics_counts_freethrow_action_type_and_ft_text():
    actions = [
        {"quarter": 2, "type": "freethrow", "r": "m", "text": "L. Doncic ft 1/2 make"},
        {"quarter": 3, "type": "freethrow", "r": "m", "text": "L. Doncic ft 2/2 make"},
        {"quarter": 3, "type": "2pt", "r": "m", "text": "L. Doncic make 2pt layup"},
    ]

    metrics_through_q2 = captioning._compute_player_metrics(actions, period=2)
    metrics_through_q3 = captioning._compute_player_metrics(actions, period=3)

    assert metrics_through_q2["pts"] == 1
    assert metrics_through_q3["pts"] == 4


def test_compute_player_metrics_counts_three_when_only_in_detail():
    actions = [
        {
            "quarter": 3,
            "type": "Jump Shot",
            "detail": "3PT Step Back Jump Shot",
            "r": "m",
            "text": "L. Doncic make step back",
        },
        {
            "quarter": 3,
            "type": "Jump Shot",
            "detail": "Pullup Jump Shot",
            "r": "m",
            "text": "L. Doncic make pullup",
        },
    ]

    metrics = captioning._compute_player_metrics(actions, period=3)
    assert metrics["pts"] == 5


def test_compute_player_metrics_counts_three_point_phrase():
    actions = [
        {
            "quarter": 3,
            "type": "Jump Shot",
            "detail": "Three Point Pullup Jump Shot",
            "r": "m",
            "text": "L. Doncic makes pullup jumper",
        }
    ]

    metrics = captioning._compute_player_metrics(actions, period=3)
    assert metrics["pts"] == 3


def test_compute_player_metrics_falls_back_to_two_for_unlabeled_made_shot():
    actions = [
        {
            "quarter": 3,
            "type": "Field Goal",
            "r": "m",
            "text": "L. Doncic makes it",
        }
    ]

    metrics = captioning._compute_player_metrics(actions, period=3)
    assert metrics["pts"] == 2


def test_validate_player_stories_aligns_points_assists_rebounds_to_metrics():
    player_stories = [
        {
            "team": "away",
            "player": "Luka Doncic",
            "caption": "Luka Doncic is dominating with 17 points, 9 assists, and 5 rebounds.",
        }
    ]
    candidates_by_team = {
        "away": [{"name": "Luka Doncic", "pts": 21, "ast": 10, "reb": 6}],
        "home": [],
    }

    validated = captioning._validate_player_stories(player_stories, candidates_by_team, max_players_per_team=2)

    assert validated == [
        {
            "team": "away",
            "player": "Luka Doncic",
            "caption": "Luka Doncic is dominating with 21 points, 10 assists, and 6 rebounds.",
        }
    ]


def test_parse_json_payload_handles_fenced_json():
    raw_text = (
        "```json\n"
        '{"full_caption":"Game stays tight through halftime.","player_stories":[]}\n'
        "```"
    )

    parsed = captioning._parse_json_payload(raw_text)

    assert parsed["full_caption"] == "Game stays tight through halftime."
    assert parsed["player_stories"] == []


def test_parse_json_payload_handles_prefixed_fenced_json():
    raw_text = (
        "Here is the JSON requested:\n"
        "```json\n"
        '{"full_caption":"Home side wins the second quarter.","player_stories":[]}\n'
        "```"
    )

    parsed = captioning._parse_json_payload(raw_text)

    assert parsed["full_caption"] == "Home side wins the second quarter."
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
    assert generation_config["thinkingConfig"] == {"thinkingBudget": 0}
    prompt = captured["body"]["contents"][0]["parts"][0]["text"]
    assert f"full_caption must be <= {captioning.FULL_CAPTION_MAX_CHARS} chars" in prompt
    assert f"player_stories should be <= {captioning.PLAYER_CAPTION_MAX_CHARS} chars each" in prompt


def test_request_period_caption_prompts_for_final_game_language(monkeypatch):
    flow_payload = {
        "last": {"quarter": 4, "time": "00:00"},
        "score": [{"quarter": 4, "awayScore": 108, "homeScore": 101}],
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
                                        "text": '{"full_caption":"DAL beats MIN 108-101.","player_stories":[]}'
                                    }
                                ]
                            }
                        }
                    ]
                }
            ).encode("utf-8")

    def fake_urlopen(req, timeout=8.0):
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _FakeResponse()

    monkeypatch.setattr(captioning.urllib.request, "urlopen", fake_urlopen)

    generated = captioning.request_period_caption(
        flow_payload=flow_payload,
        box_payload=box_payload,
        period=4,
        api_key="test-api-key",
        model="gemini-2.5-flash",
        is_final_game=True,
    )

    assert generated == {"full": "DAL beats MIN 108-101.", "players": []}
    prompt = captured["body"]["contents"][0]["parts"][0]["text"]
    assert '"gameState": {"isFinal": true, "checkpointType": "game_final", "seasonType": "regular"}' in prompt
    assert "completed-game result" in prompt
    assert "avoid in-progress phrases" in prompt


def test_request_period_caption_retries_parse_failure_once(monkeypatch):
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

    captured = {"calls": 0, "prompts": []}
    responses = [
        {
            "candidates": [
                {
                    "finishReason": "MAX_TOKENS",
                    "content": {"parts": [{"text": "Here is the JSON requested: ```"}]},
                }
            ]
        },
        {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {
                        "parts": [
                            {"text": '{"full_caption":"DAL leads after one.","player_stories":[]}'}
                        ]
                    },
                }
            ]
        },
    ]

    class _FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps(self._payload).encode("utf-8")

    def fake_urlopen(req, timeout=8.0):
        body = json.loads(req.data.decode("utf-8"))
        captured["calls"] += 1
        captured["prompts"].append(body["contents"][0]["parts"][0]["text"])
        payload = responses[captured["calls"] - 1]
        return _FakeResponse(payload)

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
    assert captured["calls"] == 2
    assert "Final reminder: Return a single minified JSON object only." in captured["prompts"][1]


def test_request_period_caption_uses_openai_chat_completions_with_strict_schema(monkeypatch):
    flow_payload = {
        "score": [{"quarter": 4, "awayScore": 97, "homeScore": 120}],
        "players": {"away": {}, "home": {}},
        "events": [],
    }
    box_payload = {"teams": {"away": {"abbr": "NYK"}, "home": {"abbr": "PHI"}}}
    captured = {}

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            content = '{"full_caption":"The 76ers beat the Knicks 120-97.","player_stories":[]}'
            return json.dumps(
                {"choices": [{"message": {"content": content}, "finish_reason": "stop"}]}
            ).encode("utf-8")

    def fake_urlopen(req, timeout=8.0):
        captured["url"] = req.full_url
        captured["auth"] = req.get_header("Authorization")
        captured["timeout"] = timeout
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _FakeResponse()

    monkeypatch.setattr(captioning.urllib.request, "urlopen", fake_urlopen)

    generated = captioning.request_period_caption(
        flow_payload=flow_payload,
        box_payload=box_payload,
        period=4,
        api_key="sk-test",
        model="gpt-6-luna",
        timeout_seconds=60.0,
        is_final_game=True,
        provider="openai",
    )

    assert generated == {"full": "The 76ers beat the Knicks 120-97.", "players": []}
    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["auth"] == "Bearer sk-test"
    assert captured["timeout"] == 60.0
    body = captured["body"]
    assert body["model"] == "gpt-6-luna"
    schema_spec = body["response_format"]["json_schema"]
    assert schema_spec["strict"] is True
    assert schema_spec["schema"]["additionalProperties"] is False
    assert schema_spec["schema"]["properties"]["player_stories"]["items"]["additionalProperties"] is False
    assert '"isFinal": true' in body["messages"][0]["content"]


def test_build_period_captions_records_provider(monkeypatch):
    flow_payload = {
        "score": [{"quarter": 2, "awayScore": 50, "homeScore": 48}],
        "events": [{"type": "period", "subType": "end", "quarter": 2}],
    }
    monkeypatch.setattr(captioning, "extract_closed_periods_from_flow", lambda flow: [1, 2])
    monkeypatch.setattr(
        captioning, "request_period_caption", lambda **kwargs: {"full": kwargs["provider"], "players": []}
    )
    captions = captioning.build_period_captions(
        flow_payload=flow_payload,
        box_payload={},
        api_key="sk-test",
        model="gpt-6-luna",
        provider="openai",
    )
    assert captions["provider"] == "openai"
    assert captions["model"] == "gpt-6-luna"
    assert captions["periods"]["2"]["full"] == "openai"


def test_build_period_captions_trusts_poller_closed_through_for_final(monkeypatch):
    # The trimmed flow's last play is a few seconds before the buzzer, so Q4 looks open.
    flow_payload = {
        "last": {"quarter": 4, "time": "0003.90", "awayScore": "124", "homeScore": "90"},
        "score": [
            {"quarter": 2, "time": "0010.00", "awayScore": "56", "homeScore": "52"},
            {"quarter": 4, "time": "0028.20", "awayScore": "124", "homeScore": "90"},
        ],
        "captions": {"v": 1, "periods": {"2": {"full": "half", "players": []}}},
    }
    requested = []
    monkeypatch.setattr(
        captioning,
        "request_period_caption",
        lambda **kwargs: requested.append(kwargs["period"]) or {"full": "final", "players": []},
    )
    kwargs = dict(
        flow_payload=flow_payload,
        box_payload={},
        existing_captions=flow_payload["captions"],
        api_key="sk-test",
        model="gpt-6-luna",
        provider="openai",
        is_final_game=True,
        include_final_overtime=True,
    )
    assert set(captioning.build_period_captions(**kwargs)["periods"]) == {"2"}
    assert requested == []

    captions = captioning.build_period_captions(**kwargs, closed_through=4)
    assert requested == [4]
    assert captions["periods"]["4"]["full"] == "final"
    assert captions["periods"]["2"]["full"] == "half"


def test_game_story_finds_runs_lead_changes_and_closing_stretch():
    timeline = [
        {"quarter": 1, "time": "1100.00", "awayScore": "2", "homeScore": "0"},
        {"quarter": 1, "time": "1000.00", "awayScore": "2", "homeScore": "3"},
        {"quarter": 1, "time": "0900.00", "awayScore": "4", "homeScore": "3"},
        {"quarter": 2, "time": "0500.00", "awayScore": "6", "homeScore": "6"},
        {"quarter": 2, "time": "0250.00", "awayScore": "6", "homeScore": "9"},
        {"quarter": 2, "time": "0200.00", "awayScore": "6", "homeScore": "12"},
        {"quarter": 2, "time": "0100.00", "awayScore": "6", "homeScore": "14"},
        {"quarter": 3, "time": "1100.00", "awayScore": "9", "homeScore": "14"},
    ]
    story = captioning._game_story(timeline, 2, "BKN", "CHA")
    assert story["leadChanges"] == 3
    assert story["timesTied"] == 1
    assert story["largestLead"] == {"BKN": 2, "CHA": 8}
    assert story["longestUnansweredRun"] == {"team": "CHA", "points": 8, "period": "Q2"}
    assert story["pointsInLast3MinOfQ2"] == {"BKN": 0, "CHA": 8}


def test_recent_events_are_rebuilt_from_player_actions():
    flow_payload = {
        "players": {
            "away": {"A One": [{"quarter": 2, "time": "0030.00", "type": "3pt", "text": "A. One make 3pt", "seq": 9, "awayScore": "50", "homeScore": "48"}]},
            "home": {
                "B Two": [
                    {"quarter": 2, "time": "0100.00", "type": "2pt", "text": "B. Two make 2pt", "seq": 7, "awayScore": "47", "homeScore": "48"},
                    {"quarter": 2, "time": "0000.00", "type": "substitution", "text": "sub", "seq": 10},
                    {"quarter": 3, "time": "1100.00", "type": "2pt", "text": "later", "seq": 11},
                ]
            },
        }
    }
    assert captioning._build_recent_events(flow_payload, 2) == [
        "Q2 0100.00 B. Two make 2pt (47-48)",
        "Q2 0030.00 A. One make 3pt (50-48)",
    ]


def test_request_period_caption_retries_request_error_once(monkeypatch):
    calls = []

    def fake_call(prompt, **kwargs):
        calls.append(prompt)
        if len(calls) == 1:
            return None
        return ['{"full_caption":"ok","player_stories":[]}'], ["stop"]

    monkeypatch.setattr(captioning, "_call_openai", fake_call)
    generated = captioning.request_period_caption(
        flow_payload={"score": [{"quarter": 2, "time": "0000.00", "awayScore": 50, "homeScore": 48}]},
        box_payload={},
        period=2,
        api_key="sk-test",
        model="gpt-6-luna",
        provider="openai",
    )
    assert generated == {"full": "ok", "players": []}
    assert len(calls) == 2


def test_player_candidates_come_from_box_stats_at_latest_checkpoint():
    flow_payload = {
        "score": [
            {"quarter": 2, "time": "0000.00", "awayScore": "56", "homeScore": "52"},
            {"quarter": 4, "time": "0000.00", "awayScore": "124", "homeScore": "90"},
        ],
        "players": {
            "away": {
                "Egor Dëmin": [{"quarter": 1, "time": "0500.00", "type": "2pt", "text": "E. Dëmin make 2pt", "r": "m"}],
                "Jalen Smith#2": [],
            },
            "home": {},
        },
    }
    box_payload = {
        "teams": {
            "away": {
                "abbr": "BKN",
                "players": [
                    {"first": "Egor", "last": "Dëmin", "stats": {"pts": 12, "fgm": 5, "fga": 8, "tpm": 2, "tpa": 3, "oreb": 1, "dreb": 4, "ast": 6, "stl": 2, "blk": 0, "to": 1}},
                    {"first": "Jalen", "last": "Smith", "stats": {"pts": 4, "fgm": 2, "fga": 2, "tpm": 0, "tpa": 0, "oreb": 0, "dreb": 1, "ast": 0, "stl": 0, "blk": 0, "to": 0}},
                    {"first": "Bench", "last": "Guy", "stats": {"pts": 0, "fgm": 0, "fga": 1, "oreb": 0, "dreb": 0, "ast": 0, "to": 0}},
                ],
            },
            "home": {"abbr": "CHA", "players": []},
        }
    }
    summary = captioning._build_summary(flow_payload, box_payload, 4, is_final_game=True)
    assert summary["players"]["away"] == [
        {"name": "Egor Dëmin", "pts": 12, "reb": 5, "ast": 6, "fg": "5-8", "3p": "2-3", "stl": 2},
        {"name": "Jalen Smith#2", "pts": 4, "reb": 1, "ast": 0, "fg": "2-2"},
    ]

    # An earlier checkpoint can't use the end-of-game box; it falls back to play-by-play counts.
    earlier = captioning._build_summary(flow_payload, box_payload, 2, is_final_game=True)
    assert earlier["players"]["away"] == [{"name": "Egor Dëmin", "pts": 2, "reb": 0, "ast": 0, "stl": 0, "blk": 0}]
