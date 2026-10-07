import copy
import base64
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


_CLOCK_RE = re.compile(r"^(?:PT)?(\d+)M(\d+)(?:\.(\d+))?S?$")
_CLOCK_COMPACT_RE = re.compile(r"^(\d+)(\d{2})(?:\.(\d+))?$")
_CLOCK_COLON_RE = re.compile(r"^(\d+):(\d+)(?:\.(\d+))?$")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_WHITESPACE_RE = re.compile(r"\s+")
_HASHTAG_RE = re.compile(r"#[A-Za-z0-9_]+")

_EXCLUDED_EVENT_TYPES = {
    "substitution",
    "jump ball",
    "jumpball",
    "period",
    "violation",
}

FULL_CAPTION_MAX_CHARS = 180
PLAYER_CAPTION_MAX_CHARS = 150
CAPTION_PROVIDERS = ("gemini", "openai")
OPENAI_BASE_URL = "https://api.openai.com/v1"


def _safe_int(value, default=None):
    try:
        if value is None:
            return default
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _clock_to_seconds(clock):
    if not clock or not isinstance(clock, str):
        return 0.0
    value = clock.strip()
    for pattern in (_CLOCK_RE, _CLOCK_COMPACT_RE, _CLOCK_COLON_RE):
        match = pattern.match(value)
        if not match:
            continue
        minutes = _safe_int(match.group(1), 0) or 0
        seconds = _safe_int(match.group(2), 0) or 0
        centis = _safe_int(match.group(3), 0) or 0
        return minutes * 60 + seconds + (centis / 100.0)
    return 0.0


def _normalize_space(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return _WHITESPACE_RE.sub(" ", text)


def _sanitize_caption(value, max_chars=220):
    text = _normalize_space(value)
    if not text:
        return ""
    text = _HASHTAG_RE.sub("", text)
    text = _normalize_space(text)
    if len(text) > max_chars:
        text = text[: max_chars - 1].rstrip() + "…"
    return text


def _period_label(period):
    period = _safe_int(period, 0) or 0
    if period <= 0:
        return "Unknown"
    if period <= 4:
        return f"Q{period}"
    return f"OT{period - 4}"


def _normalize_player_name_key(value):
    normalized = _NON_ALNUM_RE.sub("", str(value or "").lower())
    return normalized


def extract_closed_periods(actions):
    action_list = [a for a in (actions or []) if isinstance(a, dict)]
    if not action_list:
        return []

    periods_seen = sorted(
        {
            p
            for p in (_safe_int(action.get("period"), 0) for action in action_list)
            if p and p > 0
        }
    )
    if not periods_seen:
        return []

    closed = {p for p in periods_seen if p < periods_seen[-1]}
    last_action = action_list[-1]
    last_period = _safe_int(last_action.get("period"), 0) or 0
    last_clock = last_action.get("clock")
    if last_period > 0 and _clock_to_seconds(last_clock) <= 0.05:
        closed.add(last_period)

    return sorted(closed)


def extract_closed_periods_from_flow(flow_payload):
    if not isinstance(flow_payload, dict):
        return []

    score_timeline = flow_payload.get("score") or []
    periods_seen = sorted(
        {
            p
            for p in (
                _safe_int((entry or {}).get("quarter") or (entry or {}).get("period"), 0)
                for entry in score_timeline
                if isinstance(entry, dict)
            )
            if p and p > 0
        }
    )

    if not periods_seen:
        return []

    closed = {p for p in periods_seen if p < periods_seen[-1]}

    last = flow_payload.get("last") if isinstance(flow_payload, dict) else None
    if isinstance(last, dict):
        last_period = _safe_int(last.get("quarter") or last.get("period"), 0) or 0
        last_clock = last.get("time") or last.get("clock")
        if last_period > 0 and _clock_to_seconds(last_clock) <= 0.05:
            closed.add(last_period)

    return sorted(closed)


def select_caption_checkpoint_periods(closed_periods, include_final_overtime=False):
    normalized = sorted(
        {
            period
            for period in (_safe_int(value, 0) for value in (closed_periods or []))
            if period and period > 0
        }
    )
    if not normalized:
        return []

    selected = []
    for period in (2, 4):
        if period in normalized:
            selected.append(period)

    final_period = normalized[-1]
    if include_final_overtime and final_period > 4 and final_period not in selected:
        selected.append(final_period)

    return selected


def _score_at_period(score_timeline, period):
    away_score = None
    home_score = None
    for entry in score_timeline or []:
        if not isinstance(entry, dict):
            continue
        quarter = _safe_int(entry.get("quarter") or entry.get("period"), 0) or 0
        if quarter <= 0 or quarter > period:
            continue
        away = _safe_int(entry.get("awayScore") if "awayScore" in entry else entry.get("away"), None)
        home = _safe_int(entry.get("homeScore") if "homeScore" in entry else entry.get("home"), None)
        if away is not None:
            away_score = away
        if home is not None:
            home_score = home
    return away_score, home_score


def _period_splits(score_timeline, period):
    splits = []
    prev_away = 0
    prev_home = 0
    for current in range(1, period + 1):
        away_total, home_total = _score_at_period(score_timeline, current)
        if away_total is None or home_total is None:
            continue
        away_delta = max(0, away_total - prev_away)
        home_delta = max(0, home_total - prev_home)
        splits.append(
            {
                "period": current,
                "label": _period_label(current),
                "away": away_delta,
                "home": home_delta,
            }
        )
        prev_away = away_total
        prev_home = home_total
    return splits


def _flow_events(flow_payload):
    """Flow payloads carry plays per player, not one event list; rebuild it in game order."""
    raw_events = flow_payload.get("events") if isinstance(flow_payload, dict) else None
    if raw_events:
        return raw_events
    players = (flow_payload or {}).get("players") if isinstance(flow_payload, dict) else None
    merged = {}
    for side in ("away", "home"):
        player_map = players.get(side) if isinstance(players, dict) else None
        for actions in (player_map or {}).values():
            for action in actions or []:
                if not isinstance(action, dict):
                    continue
                key = (action.get("seq"), action.get("text"))
                merged.setdefault(key, action)
    return sorted(
        merged.values(),
        key=lambda action: (
            _safe_int(action.get("quarter") or action.get("period"), 0) or 0,
            -_clock_to_seconds(action.get("time") or action.get("clock")),
        ),
    )


def _build_recent_events(flow_payload, period, limit=8):
    events = []
    for action in _flow_events(flow_payload):
        if not isinstance(action, dict):
            continue
        action_period = _safe_int(action.get("quarter") or action.get("period"), 0) or 0
        if action_period <= 0 or action_period > period:
            continue
        action_type = _normalize_space(action.get("type") or action.get("actionType")).lower()
        if action_type in _EXCLUDED_EVENT_TYPES:
            continue
        text = _normalize_space(action.get("text") or action.get("description"))
        if not text:
            continue
        clock = _normalize_space(action.get("time") or action.get("clock"))
        away = _safe_int(action.get("awayScore") if "awayScore" in action else action.get("away"), None)
        home = _safe_int(action.get("homeScore") if "homeScore" in action else action.get("home"), None)
        score_suffix = ""
        if away is not None and home is not None:
            score_suffix = f" ({away}-{home})"
        line = _normalize_space(f"{_period_label(action_period)} {clock} {text}{score_suffix}")
        if len(line) > 140:
            line = line[:139].rstrip() + "…"
        events.append(line)
    return events[-limit:]


def _latest_flow_period(flow_payload):
    periods = []
    score_timeline = (flow_payload or {}).get("score") or []
    for entry in score_timeline:
        if not isinstance(entry, dict):
            continue
        period = _safe_int(entry.get("quarter") or entry.get("period"), 0) or 0
        if period > 0:
            periods.append(period)

    last = (flow_payload or {}).get("last")
    if isinstance(last, dict):
        period = _safe_int(last.get("quarter") or last.get("period"), 0) or 0
        if period > 0:
            periods.append(period)

    return max(periods) if periods else 0


def _is_final_caption_checkpoint(flow_payload, period, is_final_game):
    if not is_final_game:
        return False
    latest_period = _latest_flow_period(flow_payload)
    return period > 0 and (latest_period <= 0 or period >= latest_period)


def _should_generate_caption_checkpoint(period, flow_payload, is_final_game):
    if period < 4:
        return True
    if _is_final_caption_checkpoint(flow_payload, period, is_final_game):
        return True
    latest_period = _latest_flow_period(flow_payload)
    return latest_period > period


def filter_caption_checkpoint_periods(selected_periods, flow_payload, is_final_game=False):
    return [
        period
        for period in selected_periods or []
        if _should_generate_caption_checkpoint(period, flow_payload, is_final_game)
    ]


def _compute_player_metrics(actions, period):
    points = 0
    assists = 0
    rebounds = 0
    steals = 0
    blocks = 0
    turnovers = 0

    for action in actions or []:
        if not isinstance(action, dict):
            continue
        action_period = _safe_int(action.get("quarter") or action.get("period"), 0) or 0
        if action_period <= 0 or action_period > period:
            continue

        action_type = _normalize_space(action.get("type") or action.get("actionType")).lower()
        result = _normalize_space(action.get("r") or action.get("result")).lower()
        text = _normalize_space(action.get("text") or action.get("description")).lower()
        detail = _normalize_space(action.get("detail") or action.get("subType")).lower()

        scoring_text = f"{action_type} {text} {detail}"
        is_three_pointer = (
            "3pt" in scoring_text
            or "3 pt" in scoring_text
            or "three point" in scoring_text
        )
        is_two_pointer = "2pt" in scoring_text or "2 pt" in scoring_text or "two point" in scoring_text
        is_field_goal = any(
            token in scoring_text
            for token in ("shot", "layup", "dunk", "tip", "hook", "jumper", "floater", "runner", "putback")
        )

        is_free_throw = (
            "freethrow" in action_type
            or "free throw" in action_type
            or "free throw" in text
            or bool(re.search(r"\bft\b", text))
        )

        if result.startswith("m"):
            if is_free_throw:
                points += 1
            elif is_three_pointer:
                points += 3
            elif is_two_pointer or is_field_goal:
                points += 2
            else:
                # Treat remaining made scoring events as 2PT to avoid undercounting
                # when feed variants omit explicit shot tags.
                points += 2

        if action_type == "assist":
            assists += 1
        if "rebound" in action_type:
            rebounds += 1
        if "steal" in action_type:
            steals += 1
        if "block" in action_type:
            blocks += 1
        if "turnover" in action_type:
            turnovers += 1

    impact = (
        points * 3.0
        + assists * 2.4
        + rebounds * 1.2
        + steals * 2.2
        + blocks * 2.0
        - turnovers * 0.8
    )
    notable = (
        points >= 8
        or assists >= 4
        or rebounds >= 6
        or steals >= 2
        or blocks >= 2
        or impact >= 18
    )

    return {
        "pts": points,
        "ast": assists,
        "reb": rebounds,
        "stl": steals,
        "blk": blocks,
        "to": turnovers,
        "impact": round(impact, 1),
        "notable": notable,
    }


def _top_player_candidates(flow_payload, period, max_candidates=4):
    """Fallback when the box has no player stats: counts rebuilt from play-by-play."""
    players = (flow_payload or {}).get("players") or {}
    output = {"away": [], "home": []}
    for side in ("away", "home"):
        player_map = players.get(side) if isinstance(players, dict) else {}
        ranked = []
        for name, actions in (player_map or {}).items():
            metrics = _compute_player_metrics(actions, period)
            if metrics["impact"] <= 0 and not metrics["notable"]:
                continue
            ranked.append({"name": name, **metrics})

        ranked.sort(
            key=lambda item: (
                item.get("notable") is True,
                item.get("impact", 0),
                item.get("pts", 0),
                item.get("ast", 0),
                item.get("reb", 0),
            ),
            reverse=True,
        )
        output[side] = [
            {key: item[key] for key in ("name", "pts", "reb", "ast", "stl", "blk")}
            for item in ranked[:max_candidates]
        ]
    return output


def _box_player_candidates(box_payload, flow_payload, max_candidates=4):
    """Top players from the official box score, which is current as of this poll."""
    teams = (box_payload or {}).get("teams") or {}
    flow_players = (flow_payload or {}).get("players") or {}
    output = {"away": [], "home": []}
    found_stats = False
    for side in ("away", "home"):
        # Name candidates by their flow key: the site matches player captions against it.
        flow_names = {
            _normalize_player_name_key(re.sub(r"#\d+$", "", name)): name
            for name in ((flow_players.get(side) if isinstance(flow_players, dict) else None) or {})
        }
        ranked = []
        for player in (teams.get(side) or {}).get("players") or []:
            stats = (player or {}).get("stats") if isinstance(player, dict) else None
            if not isinstance(stats, dict):
                continue
            found_stats = True
            full_name = _normalize_space(f"{player.get('first') or ''} {player.get('last') or ''}")
            if not full_name:
                continue
            stat = lambda key: _safe_int(stats.get(key), 0) or 0
            line = {
                "name": flow_names.get(_normalize_player_name_key(full_name), full_name),
                "pts": stat("pts"),
                "reb": stat("oreb") + stat("dreb"),
                "ast": stat("ast"),
                "fg": f"{stat('fgm')}-{stat('fga')}",
            }
            if stat("tpa"):
                line["3p"] = f"{stat('tpm')}-{stat('tpa')}"
            for key in ("stl", "blk"):
                if stat(key) >= 2:
                    line[key] = stat(key)
            if stat("to") >= 4:
                line["to"] = stat("to")
            impact = (
                line["pts"] * 3.0 + line["ast"] * 2.4 + line["reb"] * 1.2
                + stat("stl") * 2.2 + stat("blk") * 2.0 - stat("to") * 0.8
            )
            if impact > 0:
                ranked.append((impact, line))
        ranked.sort(key=lambda item: item[0], reverse=True)
        output[side] = [line for _, line in ranked[:max_candidates]]
    return output if found_stats else None


def _game_story(score_timeline, period, away_abbr, home_abbr):
    """Facts that make a caption specific: runs, lead swings, how the period ended."""
    names = {"away": away_abbr, "home": home_abbr}
    prev = {"away": 0, "home": 0}
    largest_lead = {"away": 0, "home": 0}
    lead_changes = 0
    times_tied = 0
    leader = None
    run_team, run_points, run_period = None, 0, 0
    best_run = None
    closing_start = None
    last_period_entry = None

    for entry in score_timeline or []:
        if not isinstance(entry, dict):
            continue
        quarter = _safe_int(entry.get("quarter") or entry.get("period"), 0) or 0
        if quarter <= 0 or quarter > period:
            continue
        away = _safe_int(entry.get("awayScore") if "awayScore" in entry else entry.get("away"), None)
        home = _safe_int(entry.get("homeScore") if "homeScore" in entry else entry.get("home"), None)
        if away is None or home is None:
            continue
        seconds_left = _clock_to_seconds(entry.get("time") or entry.get("clock"))
        if closing_start is None and quarter == period and seconds_left <= 180:
            closing_start = dict(prev)

        scored = {"away": max(0, away - prev["away"]), "home": max(0, home - prev["home"])}
        if scored["away"] and not scored["home"]:
            side = "away"
        elif scored["home"] and not scored["away"]:
            side = "home"
        else:
            side = None
        if side and side == run_team:
            run_points += scored[side]
        else:
            run_team, run_points, run_period = side, scored[side] if side else 0, quarter
        if run_team and (best_run is None or run_points > best_run[1]):
            best_run = (run_team, run_points, run_period)

        margin = home - away
        current = "home" if margin > 0 else "away" if margin < 0 else None
        if current is None and leader is not None and (prev["home"] - prev["away"]) != 0:
            times_tied += 1
        if current and leader and current != leader:
            lead_changes += 1
        if current:
            leader = current
            largest_lead[current] = max(largest_lead[current], abs(margin))
        prev = {"away": away, "home": home}
        last_period_entry = quarter

    if last_period_entry is None:
        return None
    if closing_start is None:
        closing_start = dict(prev)

    story = {
        "leadChanges": lead_changes,
        "timesTied": times_tied,
        "largestLead": {names[side]: largest_lead[side] for side in ("away", "home")},
        f"pointsInLast3MinOf{_period_label(period)}": {
            names[side]: prev[side] - closing_start[side] for side in ("away", "home")
        },
    }
    if best_run and best_run[1] >= 6:
        story["longestUnansweredRun"] = {
            "team": names[best_run[0]],
            "points": best_run[1],
            "period": _period_label(best_run[2]),
        }
    return story


def _build_summary(flow_payload, box_payload, period, is_final_game=False):
    score_timeline = (flow_payload or {}).get("score") or []
    away_total, home_total = _score_at_period(score_timeline, period)
    if away_total is None or home_total is None:
        return None

    away_team = ((box_payload or {}).get("teams") or {}).get("away") or {}
    home_team = ((box_payload or {}).get("teams") or {}).get("home") or {}
    away_abbr = _normalize_space(away_team.get("abbr")) or "Away"
    home_abbr = _normalize_space(home_team.get("abbr")) or "Home"

    # The box only reflects the game as of this poll, so it fits the latest checkpoint only.
    latest_period = _latest_flow_period(flow_payload)
    players_by_team = None
    if period >= latest_period or _is_final_caption_checkpoint(flow_payload, period, is_final_game):
        players_by_team = _box_player_candidates(box_payload, flow_payload)
    if players_by_team is None:
        players_by_team = _top_player_candidates(flow_payload, period)
    period_splits = _period_splits(score_timeline, period)
    recent_events = _build_recent_events(flow_payload, period, limit=8)
    is_final_checkpoint = _is_final_caption_checkpoint(flow_payload, period, is_final_game)

    return {
        "period": period,
        "periodLabel": _period_label(period),
        "gameState": {
            "isFinal": is_final_checkpoint,
            "checkpointType": "game_final" if is_final_checkpoint else "period_checkpoint",
            "seasonType": _normalize_space((box_payload or {}).get("seasonType")) or "regular",
        },
        "score": {
            "awayTeam": away_abbr,
            "awayName": _normalize_space(away_team.get("name")) or away_abbr,
            "homeTeam": home_abbr,
            "homeName": _normalize_space(home_team.get("name")) or home_abbr,
            "away": away_total,
            "home": home_total,
        },
        "periodSplits": period_splits,
        "story": _game_story(score_timeline, period, away_abbr, home_abbr),
        "recentEvents": recent_events,
        "players": players_by_team,
    }


def _build_prompt(summary, max_players_per_team):
    context = {
        "checkpoint": summary.get("periodLabel"),
        "gameState": summary.get("gameState"),
        "score": summary.get("score"),
        "periodSplits": summary.get("periodSplits"),
        "story": summary.get("story"),
        "recentEvents": summary.get("recentEvents"),
        "playerCandidates": summary.get("players"),
    }
    context_json = json.dumps(context, ensure_ascii=False)
    return (
        "Write the captions shown under an NBA play-by-play chart at a checkpoint (halftime or the end of the game).\n"
        "Return JSON matching this shape:\n"
        '{'
        '"full_caption":"string",'
        '"player_stories":[{"team":"away|home","player":"exact candidate name","caption":"string"}]'
        "}\n"
        "What makes a good full_caption:\n"
        "- Find the one thing a fan would want to know about this game so far and lead with it: a decisive run, "
        "a quarter one team won big, a comeback, a blowout, a lead that kept changing hands, a late surge, "
        "or a player carrying his team.\n"
        "- Back it with a concrete number from the context (a run, a quarter split, a largest lead, a player line).\n"
        "- Use team names (city or nickname), not abbreviations.\n"
        "- Avoid filler that fits any game: 'traded baskets', 'back-and-forth', 'strong performance', "
        "'both teams', 'battled', 'carries an edge'. Only call a game close or see-saw if leadChanges or timesTied "
        "say so.\n"
        "- Plain, confident sports-desk voice. One or two short sentences. Do not just restate the score.\n"
        "- For preseason games keep the stakes low-key; do not call results statement wins.\n"
        "- Example of a weak caption: 'Brooklyn carries a 56-52 edge over Charlotte into halftime after both teams "
        "traded baskets.' Example of a strong one: 'Brooklyn turned a four-point halftime edge into a rout, "
        "outscoring Charlotte 68-38 after the break to win 124-90.'\n"
        "Rules:\n"
        "- No emojis or hashtags.\n"
        "- Use only facts in the context; never invent stats, streaks, injuries or records.\n"
        "- story.longestUnansweredRun counts only points scored with no reply; describe it as an unanswered run "
        "(e.g. '12-0 run').\n"
        f"- full_caption must be <= {FULL_CAPTION_MAX_CHARS} chars.\n"
        "- If gameState.isFinal is true, write full_caption as a completed-game result: make it clear the winner has won "
        "and avoid in-progress phrases like leads, takes a lead, heads into, or through Q4.\n"
        "- If gameState.isFinal is false, do not imply the game is over.\n"
        f"- player_stories should be <= {PLAYER_CAPTION_MAX_CHARS} chars each and say what made the player matter "
        "(efficiency, a big quarter, a scoring burst), not only list stats.\n"
        f"- At most {max_players_per_team} player stories per team.\n"
        "- Only use player names from playerCandidates. Their stats are as of this checkpoint; fg and 3p are "
        "made-attempted.\n"
        "- If no player story is worth posting, return an empty player_stories list.\n"
        f"Context JSON:\n{context_json}"
    )


def _extract_gemini_texts(payload):
    extracted = []
    candidates = payload.get("candidates") if isinstance(payload, dict) else []
    for candidate in candidates or []:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content") or {}
        parts = content.get("parts") if isinstance(content, dict) else []
        text_parts = []
        for part in parts or []:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text)
            inline_data = part.get("inlineData")
            if isinstance(inline_data, dict):
                mime_type = _normalize_space(inline_data.get("mimeType")).lower()
                data = inline_data.get("data")
                if mime_type == "application/json" and isinstance(data, str) and data.strip():
                    try:
                        decoded = base64.b64decode(data).decode("utf-8")
                    except Exception:
                        decoded = ""
                    if decoded.strip():
                        text_parts.append(decoded)
        joined = "\n".join(text_parts).strip()
        if joined:
            extracted.append(joined)
    return extracted


def _extract_gemini_text(payload):
    texts = _extract_gemini_texts(payload)
    if texts:
        return texts[0]
    return ""


def _extract_finish_reasons(payload):
    reasons = []
    candidates = payload.get("candidates") if isinstance(payload, dict) else []
    for candidate in candidates or []:
        if not isinstance(candidate, dict):
            continue
        reason = _normalize_space(candidate.get("finishReason"))
        if reason:
            reasons.append(reason)
    return reasons


def _caption_response_schema():
    return {
        "type": "object",
        "properties": {
            "full_caption": {"type": "string"},
            "player_stories": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "team": {"type": "string", "enum": ["away", "home"]},
                        "player": {"type": "string"},
                        "caption": {"type": "string"},
                    },
                    "required": ["team", "player", "caption"],
                },
            },
        },
        "required": ["full_caption", "player_stories"],
    }


def _openai_caption_schema():
    """OpenAI strict structured outputs require additionalProperties=false on every object."""
    schema = _caption_response_schema()
    schema["additionalProperties"] = False
    schema["properties"]["player_stories"]["items"]["additionalProperties"] = False
    return schema


def _call_gemini(prompt, *, api_key, model, timeout_seconds):
    """Returns (candidate texts, finish reasons), or None on a request error."""
    model_id = urllib.parse.quote(model, safe=".-_")
    api_key_q = urllib.parse.quote(api_key, safe="")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={api_key_q}"
    generation_config = {
        "temperature": 0.0,
        "topP": 0.9,
        "maxOutputTokens": 512,
        "responseMimeType": "application/json",
        "responseSchema": _caption_response_schema(),
    }
    if "2.5" in _normalize_space(model).lower():
        generation_config["thinkingConfig"] = {"thinkingBudget": 0}
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": generation_config}
    payload = _post_json(url, body, headers={}, timeout_seconds=timeout_seconds)
    if payload is None:
        return None
    return _extract_gemini_texts(payload), _extract_finish_reasons(payload)


def _call_openai(prompt, *, api_key, model, timeout_seconds):
    """Chat Completions with strict JSON schema, as used in nba-market-research."""
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "period_caption", "strict": True, "schema": _openai_caption_schema()},
        },
    }
    payload = _post_json(
        f"{OPENAI_BASE_URL}/chat/completions",
        body,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout_seconds=timeout_seconds,
    )
    if payload is None:
        return None
    texts, reasons = [], []
    for choice in payload.get("choices") or []:
        if not isinstance(choice, dict):
            continue
        content = (choice.get("message") or {}).get("content")
        if isinstance(content, str) and content.strip():
            texts.append(content)
        if choice.get("finish_reason"):
            reasons.append(str(choice["finish_reason"]))
    return texts, reasons


def _post_json(url, body, *, headers, timeout_seconds):
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    for name, value in headers.items():
        req.add_header(name, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        print(f"Caption AI HTTP error: {err.code}")
    except Exception as err:
        print(f"Caption AI request failed: {err}")
    return None


def _extract_first_json_object(text):
    raw = str(text or "")
    start = raw.find("{")
    if start < 0:
        return ""

    depth = 0
    in_string = False
    escaped = False
    for idx in range(start, len(raw)):
        ch = raw[idx]
        if escaped:
            escaped = False
            continue
        if in_string and ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
            continue
        if ch == "}":
            depth -= 1
            if depth == 0:
                return raw[start : idx + 1]
            if depth < 0:
                return ""
    return ""


def _parse_json_payload(raw_text):
    text = str(raw_text or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = text.strip("`")
        text = re.sub(r"^\s*json\s*", "", text, flags=re.IGNORECASE).strip()

    for candidate in (text, _normalize_space(text)):
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    extracted = _extract_first_json_object(text)
    for candidate in (extracted, _normalize_space(extracted)):
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    return None


def _coerce_caption_payload(parsed):
    if not isinstance(parsed, dict):
        return None

    full_caption = parsed.get("full_caption")
    if full_caption is None:
        full_caption = parsed.get("fullCaption")

    player_stories = parsed.get("player_stories")
    if player_stories is None:
        player_stories = parsed.get("playerStories")

    if full_caption is None and player_stories is None:
        return None
    return {
        "full_caption": full_caption,
        "player_stories": player_stories if isinstance(player_stories, list) else [],
    }


def _preview_raw_response(raw_text, max_chars=260):
    text = _normalize_space(raw_text)
    if not text:
        return "<empty>"
    if len(text) > max_chars:
        return text[: max_chars - 1].rstrip() + "…"
    return text


def _canonical_player_name(raw_name, allowed_names):
    normalized = _normalize_player_name_key(raw_name)
    if not normalized:
        return None
    for candidate in allowed_names:
        if _normalize_player_name_key(candidate) == normalized:
            return candidate
    return None


def _align_caption_to_player_metrics(caption, metrics):
    text = _normalize_space(caption)
    if not text or not isinstance(metrics, dict):
        return text

    pts = _safe_int(metrics.get("pts"), None)
    ast = _safe_int(metrics.get("ast"), None)
    reb = _safe_int(metrics.get("reb"), None)

    if pts is not None:
        points_label = "point" if pts == 1 else "points"
        text = re.sub(r"\b\d+\s+points?\b", f"{pts} {points_label}", text, flags=re.IGNORECASE)
    if ast is not None:
        assists_label = "assist" if ast == 1 else "assists"
        text = re.sub(r"\b\d+\s+assists?\b", f"{ast} {assists_label}", text, flags=re.IGNORECASE)
    if reb is not None:
        rebounds_label = "rebound" if reb == 1 else "rebounds"
        text = re.sub(r"\b\d+\s+rebounds?\b", f"{reb} {rebounds_label}", text, flags=re.IGNORECASE)

    return text


def _validate_player_stories(player_stories, candidates_by_team, max_players_per_team):
    validated = []
    counts = {"away": 0, "home": 0}
    team_candidates = {
        "away": [item for item in (candidates_by_team or {}).get("away", []) if item.get("name")],
        "home": [item for item in (candidates_by_team or {}).get("home", []) if item.get("name")],
    }
    allowed = {
        "away": [item.get("name") for item in team_candidates.get("away", [])],
        "home": [item.get("name") for item in team_candidates.get("home", [])],
    }
    metrics_by_team = {
        side: {
            _normalize_player_name_key(item.get("name")): item
            for item in team_candidates.get(side, [])
            if item.get("name")
        }
        for side in ("away", "home")
    }

    for item in player_stories or []:
        if not isinstance(item, dict):
            continue
        team = _normalize_space(item.get("team")).lower()
        if team not in ("away", "home"):
            continue
        if counts[team] >= max_players_per_team:
            continue

        player_name = _canonical_player_name(item.get("player"), allowed.get(team) or [])
        if not player_name:
            continue
        player_metrics = metrics_by_team.get(team, {}).get(_normalize_player_name_key(player_name)) or {}
        aligned_caption = _align_caption_to_player_metrics(item.get("caption"), player_metrics)
        caption = _sanitize_caption(aligned_caption, max_chars=PLAYER_CAPTION_MAX_CHARS)
        if not caption:
            continue

        validated.append(
            {
                "team": team,
                "player": player_name,
                "caption": caption,
            }
        )
        counts[team] += 1

    return validated


def request_period_caption(
    *,
    flow_payload,
    box_payload,
    period,
    api_key,
    model,
    max_players_per_team=2,
    timeout_seconds=8.0,
    is_final_game=False,
    provider="gemini",
):
    summary = _build_summary(flow_payload, box_payload, period, is_final_game=is_final_game)
    if not summary:
        return None

    prompt = _build_prompt(summary, max_players_per_team)
    call = _call_openai if provider == "openai" else _call_gemini
    for attempt in (1, 2):
        attempt_prompt = prompt
        if attempt == 2:
            attempt_prompt += (
                "\nFinal reminder: Return a single minified JSON object only. "
                "No prose, no markdown fences."
            )

        result = call(attempt_prompt, api_key=api_key, model=model, timeout_seconds=timeout_seconds)
        if result is None:
            print(f"Caption AI ({provider}) failed for {_period_label(period)} (attempt {attempt}/2)")
            continue
        texts, finish_reasons = result

        parsed = None
        raw_text = ""
        for text in texts:
            raw_text = text
            parsed = _coerce_caption_payload(_parse_json_payload(text))
            if parsed:
                break
        if parsed:
            break

        preview = _preview_raw_response(raw_text)
        print(
            f"Caption AI parse failed for {_period_label(period)} "
            f"(attempt {attempt}/2, finish={','.join(finish_reasons) or 'unknown'}): {preview}"
        )
    else:
        return None

    full_caption = _sanitize_caption(parsed.get("full_caption"), max_chars=FULL_CAPTION_MAX_CHARS)
    player_stories = _validate_player_stories(
        parsed.get("player_stories"),
        summary.get("players"),
        max_players_per_team=max_players_per_team,
    )

    return {
        "full": full_caption,
        "players": player_stories,
    }


def merge_captions(base, extra):
    """Union of caption periods; base wins for a period present in both."""
    if not isinstance(extra, dict):
        return base
    if not isinstance(base, dict):
        return extra
    merged = dict(extra)
    merged["periods"] = {**(extra.get("periods") or {}), **(base.get("periods") or {})}
    return merged


def _initialize_captions(existing_captions, model, provider="gemini"):
    base = {
        "v": 1,
        "provider": provider,
        "model": model,
        "updatedAt": "",
        "limits": {
            "full": FULL_CAPTION_MAX_CHARS,
            "player": PLAYER_CAPTION_MAX_CHARS,
        },
        "periods": {},
    }
    if not isinstance(existing_captions, dict):
        return base

    merged = copy.deepcopy(base)
    for key in ("v", "provider", "model", "updatedAt"):
        if key in existing_captions:
            merged[key] = existing_captions.get(key)

    # Always normalize caption limits to backend constants so clients can trust this metadata.
    merged["limits"] = {
        "full": FULL_CAPTION_MAX_CHARS,
        "player": PLAYER_CAPTION_MAX_CHARS,
    }

    raw_periods = existing_captions.get("periods")
    if isinstance(raw_periods, dict):
        for period_key, entry in raw_periods.items():
            if isinstance(entry, dict):
                merged["periods"][str(period_key)] = copy.deepcopy(entry)
    return merged


def _finalize_captions(captions, model, provider="gemini"):
    captions["provider"] = provider
    captions["model"] = model
    captions["updatedAt"] = datetime.now(timezone.utc).isoformat()
    return captions


def build_period_captions(
    *,
    actions=None,
    flow_payload,
    box_payload,
    existing_captions=None,
    api_key=None,
    model="gemini-2.5-flash",
    max_players_per_team=2,
    timeout_seconds=8.0,
    include_final_overtime=False,
    is_final_game=False,
    provider="gemini",
    closed_through=None,
):
    if not api_key or not isinstance(flow_payload, dict):
        return existing_captions

    effective_is_final_game = bool(is_final_game or include_final_overtime)

    if actions is not None:
        closed_periods = extract_closed_periods(actions)
    else:
        closed_periods = extract_closed_periods_from_flow(flow_payload)
    # The poller sees the raw feed's period-end events; the trimmed flow can miss them
    # (its last play is often a few seconds before the buzzer).
    closed_through = _safe_int(closed_through, 0) or 0
    if closed_through > 0:
        closed_periods = sorted(set(closed_periods) | set(range(1, closed_through + 1)))
    if not closed_periods:
        return existing_captions

    captions = _initialize_captions(existing_captions, model, provider)
    changed = isinstance(existing_captions, dict) and captions != existing_captions
    selected_periods = select_caption_checkpoint_periods(
        closed_periods,
        include_final_overtime=include_final_overtime,
    )
    selected_periods = filter_caption_checkpoint_periods(
        selected_periods,
        flow_payload,
        is_final_game=effective_is_final_game,
    )
    if not selected_periods:
        return _finalize_captions(captions, model, provider) if changed else existing_captions

    for period in selected_periods:
        period_key = str(period)
        if period_key in captions["periods"]:
            continue

        generated = request_period_caption(
            flow_payload=flow_payload,
            box_payload=box_payload,
            period=period,
            api_key=api_key,
            model=model,
            max_players_per_team=max_players_per_team,
            timeout_seconds=timeout_seconds,
            is_final_game=effective_is_final_game,
            provider=provider,
        )
        if not generated:
            continue

        captions["periods"][period_key] = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "full": generated.get("full", ""),
            "players": generated.get("players", []),
        }
        changed = True

    if not changed:
        return existing_captions

    return _finalize_captions(captions, model, provider)
