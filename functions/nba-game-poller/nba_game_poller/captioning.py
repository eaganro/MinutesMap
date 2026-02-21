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


def _build_recent_events(flow_payload, period, limit=8):
    events = []
    raw_events = flow_payload.get("events") if isinstance(flow_payload, dict) else []
    for action in raw_events or []:
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

        if result.startswith("m"):
            if "free throw" in action_type or "free throw" in text:
                points += 1
            elif "3" in action_type or "3pt" in text:
                points += 3
            elif (
                "2" in action_type
                or "shot" in action_type
                or "layup" in text
                or "dunk" in text
                or "tip" in text
            ):
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


def _top_player_candidates(flow_payload, period, max_candidates=6):
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
        output[side] = ranked[:max_candidates]
    return output


def _build_summary(flow_payload, box_payload, period):
    score_timeline = (flow_payload or {}).get("score") or []
    away_total, home_total = _score_at_period(score_timeline, period)
    if away_total is None or home_total is None:
        return None

    away_team = ((box_payload or {}).get("teams") or {}).get("away") or {}
    home_team = ((box_payload or {}).get("teams") or {}).get("home") or {}
    away_abbr = _normalize_space(away_team.get("abbr")) or "Away"
    home_abbr = _normalize_space(home_team.get("abbr")) or "Home"

    players_by_team = _top_player_candidates(flow_payload, period)
    period_splits = _period_splits(score_timeline, period)
    recent_events = _build_recent_events(flow_payload, period, limit=8)

    return {
        "period": period,
        "periodLabel": _period_label(period),
        "score": {
            "awayTeam": away_abbr,
            "homeTeam": home_abbr,
            "away": away_total,
            "home": home_total,
        },
        "periodSplits": period_splits,
        "recentEvents": recent_events,
        "players": players_by_team,
    }


def _build_prompt(summary, max_players_per_team):
    context = {
        "checkpoint": summary.get("periodLabel"),
        "score": summary.get("score"),
        "periodSplits": summary.get("periodSplits"),
        "recentEvents": summary.get("recentEvents"),
        "playerCandidates": summary.get("players"),
    }
    context_json = json.dumps(context, ensure_ascii=False)
    return (
        "Write concise NBA image captions for a play-by-play timeline.\n"
        "Return strict JSON only (no markdown, no prose):\n"
        '{'
        '"full_caption":"string",'
        '"player_stories":[{"team":"away|home","player":"exact candidate name","caption":"string"}]'
        "}\n"
        "Rules:\n"
        "- Output must be valid minified JSON.\n"
        '- Use double quotes for all keys and string values, and escape any internal quotes.\n'
        "- No emojis.\n"
        "- No hashtags.\n"
        "- full_caption should be <= 180 chars and focus on the game story up to this checkpoint.\n"
        "- player_stories should be <= 150 chars each.\n"
        f"- At most {max_players_per_team} player stories per team.\n"
        "- Only use player names from playerCandidates.\n"
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


def _validate_player_stories(player_stories, candidates_by_team, max_players_per_team):
    validated = []
    counts = {"away": 0, "home": 0}
    allowed = {
        "away": [item.get("name") for item in (candidates_by_team or {}).get("away", []) if item.get("name")],
        "home": [item.get("name") for item in (candidates_by_team or {}).get("home", []) if item.get("name")],
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
        caption = _sanitize_caption(item.get("caption"), max_chars=150)
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
):
    summary = _build_summary(flow_payload, box_payload, period)
    if not summary:
        return None

    prompt = _build_prompt(summary, max_players_per_team)
    model_id = urllib.parse.quote(model, safe=".-_")
    api_key_q = urllib.parse.quote(api_key, safe="")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={api_key_q}"
    for attempt in (1, 2):
        attempt_prompt = prompt
        if attempt == 2:
            attempt_prompt += (
                "\nFinal reminder: Return a single minified JSON object only. "
                "No prose, no markdown fences."
            )

        generation_config = {
            "temperature": 0.0,
            "topP": 0.9,
            "maxOutputTokens": 512,
            "responseMimeType": "application/json",
            "responseSchema": _caption_response_schema(),
        }
        model_lower = _normalize_space(model).lower()
        if "2.5" in model_lower:
            generation_config["thinkingConfig"] = {"thinkingBudget": 0}

        body = json.dumps(
            {
                "contents": [{"parts": [{"text": attempt_prompt}]}],
                "generationConfig": generation_config,
            }
        ).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw)
        except urllib.error.HTTPError as err:
            print(f"Caption AI HTTP error for {_period_label(period)}: {err.code}")
            return None
        except Exception as err:
            print(f"Caption AI request failed for {_period_label(period)}: {err}")
            return None

        parsed = None
        raw_text = ""
        for text in _extract_gemini_texts(payload):
            raw_text = text
            parsed = _coerce_caption_payload(_parse_json_payload(text))
            if parsed:
                break
        if parsed:
            break

        preview = _preview_raw_response(raw_text)
        finish_reasons = ",".join(_extract_finish_reasons(payload)) or "unknown"
        print(
            f"Caption AI parse failed for {_period_label(period)} "
            f"(attempt {attempt}/2, finish={finish_reasons}): {preview}"
        )
    else:
        return None

    full_caption = _sanitize_caption(parsed.get("full_caption"), max_chars=180)
    player_stories = _validate_player_stories(
        parsed.get("player_stories"),
        summary.get("players"),
        max_players_per_team=max_players_per_team,
    )

    return {
        "full": full_caption,
        "players": player_stories,
    }


def _initialize_captions(existing_captions, model):
    base = {
        "v": 1,
        "provider": "gemini",
        "model": model,
        "updatedAt": "",
        "periods": {},
    }
    if not isinstance(existing_captions, dict):
        return base

    merged = copy.deepcopy(base)
    for key in ("v", "provider", "model", "updatedAt"):
        if key in existing_captions:
            merged[key] = existing_captions.get(key)

    raw_periods = existing_captions.get("periods")
    if isinstance(raw_periods, dict):
        for period_key, entry in raw_periods.items():
            if isinstance(entry, dict):
                merged["periods"][str(period_key)] = copy.deepcopy(entry)
    return merged


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
):
    if not api_key or not isinstance(flow_payload, dict):
        return existing_captions

    if actions is not None:
        closed_periods = extract_closed_periods(actions)
    else:
        closed_periods = extract_closed_periods_from_flow(flow_payload)
    if not closed_periods:
        return existing_captions

    captions = _initialize_captions(existing_captions, model)
    changed = False

    for period in closed_periods:
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

    captions["provider"] = "gemini"
    captions["model"] = model
    captions["updatedAt"] = datetime.now(timezone.utc).isoformat()
    return captions
