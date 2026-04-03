import re
from datetime import datetime, timezone


_CLOCK_RE = re.compile(r"^(?:PT)?(\d+)M(\d+)(?:\.(\d+))?S?$")
_CLOCK_COMPACT_RE = re.compile(r"^(\d+)(\d{2})(?:\.(\d+))?$")
_CLOCK_COLON_RE = re.compile(r"^(\d+):(\d+)(?:\.(\d+))?$")
_DISTANCE_RE = re.compile(r"(\d+)'")
_FT_ATTEMPT_RE = re.compile(r"(\d+)\s*of\s*(\d+)", re.IGNORECASE)
_JUMPBALL_RE = re.compile(
    r"Jump Ball\s+(.+?)\s+vs\.\s+(.+?)(?:\s*:\s*Tip to\s+(.+))?$",
    re.IGNORECASE,
)
_SUB_IN_OUT_RE = re.compile(r"SUB\s+(in|out):\s*(.+)", re.IGNORECASE)
_SUB_FOR_RE = re.compile(r"SUB:\s*(.+?)\s+FOR\s+(.+)", re.IGNORECASE)
_INITIAL_PREFIX_RE = re.compile(r"^[A-Z]\.")
_PLAYER_ID_KEY_PREFIX = "pid:"
_PLAYER_NAME_KEY_PREFIX = "name:"
_TARGET_SCORE_PERIOD_SECONDS = 12 * 60


def time_to_seconds(clock):
    if not clock or not isinstance(clock, str):
        return 0.0
    m = _CLOCK_RE.match(clock)
    if m:
        minutes = int(m.group(1) or 0)
        seconds = int(m.group(2) or 0)
        milliseconds = int(m.group(3) or 0)
        return minutes * 60 + seconds + milliseconds / 100.0
    m = _CLOCK_COMPACT_RE.match(clock)
    if m:
        minutes = int(m.group(1) or 0)
        seconds = int(m.group(2) or 0)
        milliseconds = int(m.group(3) or 0)
        return minutes * 60 + seconds + milliseconds / 100.0
    m = _CLOCK_COLON_RE.match(clock)
    if m:
        minutes = int(m.group(1) or 0)
        seconds = int(m.group(2) or 0)
        milliseconds = int(m.group(3) or 0)
        return minutes * 60 + seconds + milliseconds / 100.0
    return 0.0


def _trim_clock(clock):
    if not clock or not isinstance(clock, str):
        return clock
    trimmed = clock.strip()
    if trimmed.startswith("PT"):
        trimmed = trimmed[2:]
    if trimmed.endswith("S"):
        trimmed = trimmed[:-1]
    if "M" in trimmed:
        trimmed = trimmed.replace("M", "")
    return trimmed


def _parse_time_actual(action):
    raw = (action or {}).get("timeActual")
    if not isinstance(raw, str) or not raw.strip():
        return None
    value = raw.strip()
    if value.endswith("Z"):
        value = f"{value[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(value)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def _seconds_to_clock(seconds):
    try:
        total_centis = int(round(float(seconds) * 100))
    except Exception:
        total_centis = 0
    if total_centis < 0:
        total_centis = 0
    minutes, remainder = divmod(total_centis, 6000)
    whole_seconds, centis = divmod(remainder, 100)
    return f"PT{minutes}M{whole_seconds:02d}.{centis:02d}S"


def _normalize_name(action):
    return (action.get("playerNameI") or action.get("playerName") or "").strip()


def _clean_phrase(value):
    if not value or not isinstance(value, str):
        return ""
    cleaned = value.strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def _normalize_match_name(value):
    if not value or not isinstance(value, str):
        return ""
    cleaned = value.strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.replace(".", "")
    return cleaned


def _has_initial_prefix(name):
    if not name or not isinstance(name, str):
        return False
    return bool(_INITIAL_PREFIX_RE.match(name.strip()))


def _coerce_person_id(value):
    try:
        parsed = int(value)
    except Exception:
        return None
    return parsed if parsed > 0 else None


def _player_key_from_person_id(person_id):
    pid = _coerce_person_id(person_id)
    if pid is None:
        return None
    return f"{_PLAYER_ID_KEY_PREFIX}{pid}"


def _player_key_from_name(name):
    norm = _normalize_match_name(name)
    if not norm:
        return None
    return f"{_PLAYER_NAME_KEY_PREFIX}{norm}"


def _person_id_from_player_key(player_key):
    if not isinstance(player_key, str) or not player_key.startswith(_PLAYER_ID_KEY_PREFIX):
        return None
    return _coerce_person_id(player_key[len(_PLAYER_ID_KEY_PREFIX) :])


def _display_name_from_action(action, roster_labels=None, fallback_name=None):
    person_id = _coerce_person_id((action or {}).get("personId"))
    if person_id is not None and isinstance(roster_labels, dict):
        label = (roster_labels.get(person_id) or "").strip()
        if label:
            return label
    if isinstance(action, dict):
        player_name_i = (action.get("playerNameI") or "").strip()
        if player_name_i:
            return player_name_i
        player_name = (action.get("playerName") or "").strip()
        if player_name:
            return player_name
    return (fallback_name or "").strip()


def _player_key_from_action(action):
    player_key = _player_key_from_person_id((action or {}).get("personId"))
    if player_key:
        return player_key
    return _player_key_from_name(fix_player_name(action) if isinstance(action, dict) else "")


def _resolve_player_key(name, roster, player_labels=None):
    if not name or not roster:
        return None
    norm_name = _normalize_match_name(name)
    if not norm_name:
        return None
    matches = []
    for candidate in (roster or {}).keys():
        label = (player_labels or {}).get(candidate) or candidate
        norm_candidate = _normalize_match_name(label)
        if not norm_candidate:
            continue
        if norm_candidate == norm_name or norm_candidate.endswith(f" {norm_name}"):
            matches.append(candidate)
    if len(matches) == 1:
        return matches[0]
    if isinstance(name, str):
        direct_key = _player_key_from_name(name)
        if direct_key in roster:
            return direct_key
        if name in roster:
            return name
        initial_matches = [c for c in matches if _has_initial_prefix((player_labels or {}).get(c) or c)]
        if len(initial_matches) == 1:
            return initial_matches[0]
    return None


def _normalize_shot_detail(sub_type):
    detail = _clean_phrase(sub_type)
    if not detail:
        return ""
    detail = re.sub(r"\bshot\b", "", detail).strip()
    detail = re.sub(r"\s+", " ", detail)
    if detail == "jump":
        detail = "jumper"
    return detail


def _extract_shot_distance(action):
    distance = action.get("shotDistance")
    if distance is None:
        desc = action.get("description") or ""
        m = _DISTANCE_RE.search(desc)
        if m:
            distance = m.group(1)
    try:
        return int(distance)
    except Exception:
        return None


def _is_shot_action(action_type, desc):
    if action_type in ("2pt", "3pt", "freethrow", "free throw"):
        return True
    if "shot" in action_type:
        return True
    if "free throw" in desc:
        return True
    return False


def _shot_points(action_type, desc):
    if "freethrow" in action_type or "free throw" in action_type:
        return 1
    if "3pt" in action_type:
        return 3
    if "2pt" in action_type:
        return 2
    if "3pt" in desc:
        return 3
    if "shot" in action_type:
        return 2
    return None


def _shot_result(action, action_type, desc):
    shot_result = (action.get("shotResult") or "").strip().lower()
    if shot_result.startswith("made"):
        return "m"
    if shot_result.startswith("miss"):
        return "x"
    if "miss" in action_type:
        return "x"
    if "made" in action_type:
        return "m"
    if "miss" in desc:
        return "x"
    if _is_shot_action(action_type, desc):
        return "m"
    return None


def _free_throw_attempt(action, desc):
    source = action.get("subType") or desc
    if not source:
        return None, None
    match = _FT_ATTEMPT_RE.search(source)
    if not match:
        return None, None
    return match.group(1), match.group(2)


def _rebound_side(action, desc):
    detail = _clean_phrase(action.get("subType"))
    if "offensive" in detail:
        return "off"
    if "defensive" in detail:
        return "def"
    if "off:" in desc:
        return "off"
    if "def:" in desc:
        return "def"
    return ""


def _format_jumpball(desc):
    match = _JUMPBALL_RE.match(desc or "")
    if not match:
        return "jump ball"
    left = match.group(1).strip()
    right = match.group(2).strip()
    tip = match.group(3).strip() if match.group(3) else ""
    if tip:
        return f"jump {left} vs {right}, tip {tip}"
    return f"jump {left} vs {right}"


def _format_substitution(desc):
    match = _SUB_IN_OUT_RE.match(desc or "")
    if match:
        direction = match.group(1).lower()
        name = match.group(2).strip()
        return f"sub {direction} {name}" if name else f"sub {direction}"

    match = _SUB_FOR_RE.match(desc or "")
    if match:
        incoming = match.group(1).strip()
        outgoing = match.group(2).strip()
        if incoming and outgoing:
            return f"sub in {incoming}, out {outgoing}"
        if incoming:
            return f"sub in {incoming}"
        if outgoing:
            return f"sub out {outgoing}"
    return ""


def _format_action_text(action):
    action_type = _clean_phrase(action.get("actionType"))
    desc = _clean_phrase(action.get("description"))
    name = _normalize_name(action)

    if _is_shot_action(action_type, desc):
        result = _shot_result(action, action_type, desc)
        verb = "make" if result == "m" else "miss" if result == "x" else "shot"
        if "freethrow" in action_type or "free throw" in action_type:
            att, total = _free_throw_attempt(action, desc)
            parts = [name, "ft"]
            if att and total:
                parts.append(f"{att}/{total}")
            parts.append(verb)
            return " ".join(p for p in parts if p)

        points = _shot_points(action_type, desc)
        detail = _normalize_shot_detail(action.get("subType"))
        distance = _extract_shot_distance(action)
        assist = parse_assist_name(action)
        parts = [name, verb]
        if points is not None:
            parts.append(f"{points}pt")
        if detail:
            parts.append(detail)
        if distance is not None:
            parts.append(f"{distance}ft")
        if "blocked" in desc:
            parts.append("blk")
        if assist:
            parts.append(f"ast {assist}")
        return " ".join(p for p in parts if p)

    if "rebound" in action_type:
        side = _rebound_side(action, desc)
        base = f"{name} reb" if name else "reb"
        return f"{base} {side}".strip()

    if "assist" in action_type:
        return f"{name} assist".strip()

    if "steal" in action_type:
        return f"{name} steal".strip()

    if "block" in action_type:
        return f"{name} block".strip()

    if "turnover" in action_type:
        detail = _clean_phrase(action.get("subType"))
        detail = re.sub(r"turnover", "", detail).strip()
        return f"{name} turnover {detail}".strip()

    if "foul" in action_type:
        detail = _clean_phrase(action.get("subType"))
        return f"{name} foul {detail}".strip()

    if "violation" in action_type:
        detail = _clean_phrase(action.get("subType"))
        return f"{name} violation {detail}".strip()

    if "jump" in action_type:
        return _format_jumpball(action.get("description"))

    if "substitution" in action_type:
        formatted = _format_substitution(action.get("description"))
        if formatted:
            return formatted
        return f"sub {name}".strip()

    return f"{name} {action_type}".strip()


def _looks_like_initialed_name(name):
    if not name or not isinstance(name, str):
        return False
    return ". " in name or " " in name


def fix_player_name(action):
    player_name = action.get("playerName")
    player_name_i = action.get("playerNameI")
    description = action.get("description") or ""
    if player_name_i and _looks_like_initialed_name(player_name_i):
        return player_name_i.strip()
    if not player_name or not isinstance(description, str):
        return player_name

    name_loc = description.find(player_name)
    if name_loc > 0 and len(description) >= 2 and description[name_loc - 2] == ".":
        prefix = description[: name_loc - 2]
        last_space = prefix.rfind(" ")
        start = last_space + 1 if last_space >= 0 else 0
        player_name = description[start : name_loc + len(player_name)]
    return player_name


def process_score_timeline(actions):
    score_timeline = []
    s_away = "0"
    s_home = "0"
    for a in actions or []:
        if (a.get("scoreAway") or "") != "":
            if a.get("scoreAway") != s_away:
                score_timeline.append(
                    {
                        "away": a.get("scoreAway"),
                        "home": a.get("scoreHome"),
                        "clock": a.get("clock"),
                        "period": a.get("period"),
                    }
                )
                s_away = a.get("scoreAway")
            if a.get("scoreHome") != s_home:
                score_timeline.append(
                    {
                        "away": a.get("scoreAway"),
                        "home": a.get("scoreHome"),
                        "clock": a.get("clock"),
                        "period": a.get("period"),
                    }
                )
                s_home = a.get("scoreHome")
    return score_timeline


def _normalize_special_cases(name, team_tricode):
    if name == "Porter" and team_tricode == "CLE":
        return "Porter Jr."
    if name == "Yang" and team_tricode == "POR":
        return "Hansen"
    if name == "Jokic":
        return "Jokić"
    return name


def parse_assist_name(action):
    desc = action.get("description") or ""
    if "AST" not in desc:
        return None
    start_name = desc.rfind("(") + 1
    last_space = desc.rfind(" ")
    if last_space <= 0:
        return None
    end_name = start_name + (desc[start_name:last_space].rfind(" ") if last_space > start_name else -1)
    name = desc[start_name:end_name] if end_name > start_name else desc[start_name:last_space]
    name = _normalize_special_cases(name, action.get("teamTricode"))
    return name or None


def add_assist_actions(action, players, player_labels=None, roster_labels=None):
    desc = action.get("description") or ""
    name = parse_assist_name(action)
    if not name:
        return players

    start_desc = desc.rfind("(") + 1
    end_desc = desc.rfind(")")
    assist_desc = desc[start_desc:end_desc] if start_desc > 0 and end_desc > start_desc else desc

    assist_person_id = _coerce_person_id(action.get("assistPersonId"))
    assist_player_key = _player_key_from_person_id(assist_person_id) or _player_key_from_name(name)
    if not assist_player_key:
        return players

    if assist_player_key not in players:
        players[assist_player_key] = []

    first = players[assist_player_key][0] if players[assist_player_key] else {}
    base_id = action.get("actionId") or action.get("actionNumber")
    assist_player_name = first.get("playerName") or name
    assist_player_name_i = first.get("playerNameI") or action.get("assistPlayerNameInitial") or name
    if assist_person_id is not None and isinstance(roster_labels, dict):
        roster_label = (roster_labels.get(assist_person_id) or "").strip()
        if roster_label:
            assist_player_name_i = roster_label
    assist_action = {
        "actionType": "Assist",
        "clock": action.get("clock"),
        "description": assist_desc,
        "actionId": f"{base_id}a" if base_id is not None else None,
        "actionNumber": f"{action.get('actionNumber')}a",
        "teamId": action.get("teamId"),
        "scoreHome": action.get("scoreHome"),
        "scoreAway": action.get("scoreAway"),
        "personId": action.get("assistPersonId") or first.get("personId"),
        "playerName": assist_player_name,
        "playerNameI": assist_player_name_i,
        "period": action.get("period"),
        "teamTricode": action.get("teamTricode"),
    }
    players[assist_player_key].append(assist_action)
    if player_labels is not None and assist_player_key not in player_labels:
        player_labels[assist_player_key] = assist_player_name_i
    return players


def create_players(actions, away_team_id, home_team_id, away_player_labels=None, home_player_labels=None):
    away_players = {}
    home_players = {}
    away_labels = {}
    home_labels = {}

    for a in actions or []:
        team_id = a.get("teamId")
        description = a.get("description") or ""
        action_type = a.get("actionType")
        player_key = _player_key_from_action(a)
        player_name = fix_player_name(a)

        if team_id == away_team_id:
            if player_key:
                away_players.setdefault(player_key, []).append(a)
                if player_key not in away_labels:
                    away_labels[player_key] = _display_name_from_action(
                        a, roster_labels=away_player_labels, fallback_name=player_name
                    )
            if "AST" in description:
                away_players = add_assist_actions(
                    a,
                    away_players,
                    player_labels=away_labels,
                    roster_labels=away_player_labels,
                )
            if action_type == "Substitution":
                start_name = description.find("SUB:") + 5
                end_name = description.find("FOR") - 1
                name = description[start_name:end_name]
                name = _normalize_special_cases(name, a.get("teamTricode"))
                incoming_key = _resolve_player_key(name, away_players, away_labels) or _player_key_from_name(name)
                if incoming_key:
                    away_players.setdefault(incoming_key, [])
                    away_labels.setdefault(incoming_key, name)
        elif team_id == home_team_id:
            if player_key:
                home_players.setdefault(player_key, []).append(a)
                if player_key not in home_labels:
                    home_labels[player_key] = _display_name_from_action(
                        a, roster_labels=home_player_labels, fallback_name=player_name
                    )
            if "AST" in description:
                home_players = add_assist_actions(
                    a,
                    home_players,
                    player_labels=home_labels,
                    roster_labels=home_player_labels,
                )
            if action_type == "Substitution":
                start_name = description.find("SUB:") + 5
                end_name = description.find("FOR") - 1
                name = description[start_name:end_name]
                name = _normalize_special_cases(name, a.get("teamTricode"))
                incoming_key = _resolve_player_key(name, home_players, home_labels) or _player_key_from_name(name)
                if incoming_key:
                    home_players.setdefault(incoming_key, [])
                    home_labels.setdefault(incoming_key, name)

    return {
        "awayPlayers": away_players,
        "homePlayers": home_players,
        "awayLabels": away_labels,
        "homeLabels": home_labels,
    }


def create_playtimes(players):
    playtimes = {}
    for player in (players or {}).keys():
        playtimes[player] = {"times": [], "on": False}
    return playtimes


def _ensure_seed_players(players, player_labels, seed_names, seed_ids=None):
    seed_ids = list(seed_ids or [])
    seed_names = list(seed_names or [])
    max_count = max(len(seed_names), len(seed_ids))
    for idx in range(max_count):
        seed_name = seed_names[idx] if idx < len(seed_names) else ""
        seed_id = seed_ids[idx] if idx < len(seed_ids) else None
        player_key = _player_key_from_person_id(seed_id) or _player_key_from_name(seed_name) or seed_name
        if not player_key:
            continue
        if player_key not in players:
            players[player_key] = []
        if player_labels is not None and seed_name:
            player_labels.setdefault(player_key, seed_name)


def _seed_playtimes(playtimes, seed_names, seed_ids, seed_clock, seed_period):
    if seed_period != 1:
        return
    seed_ids = list(seed_ids or [])
    seed_names = list(seed_names or [])
    max_count = max(len(seed_names), len(seed_ids))
    for idx in range(max_count):
        seed_name = seed_names[idx] if idx < len(seed_names) else ""
        seed_id = seed_ids[idx] if idx < len(seed_ids) else None
        player_key = _player_key_from_person_id(seed_id) or _player_key_from_name(seed_name) or seed_name
        if not player_key:
            continue
        if player_key not in playtimes:
            playtimes[player_key] = {"times": [], "on": False}
        if playtimes[player_key].get("times"):
            continue
        if seed_clock:
            playtimes[player_key]["times"].append(
                {"start": "PT12M00.00S", "period": 1, "end": seed_clock}
            )


def _should_skip_off_court_action(action):
    action_type = _clean_phrase(action.get("actionType"))
    if action_type == "ejection":
        return True
    if "foul" not in action_type:
        return False
    detail = _clean_phrase(action.get("subType"))
    desc = _clean_phrase(action.get("description"))
    if "technical" in detail or "technical" in desc:
        return True
    return False


def update_playtime_for_key(player_key, action, playtimes):
    if not player_key or player_key not in playtimes:
        return playtimes
    if playtimes[player_key]["on"] is False:
        if _should_skip_off_court_action(action):
            return playtimes
        on_count = sum(1 for state in (playtimes or {}).values() if state.get("on") is True)
        # Heuristic auto-starts for sparse feeds should never create an impossible
        # 6-player on-court state from off-court events.
        if on_count >= 5:
            return playtimes
        playtimes[player_key]["on"] = True
        playtimes[player_key]["times"].append(
            {"start": "PT12M00.00S", "period": action.get("period"), "end": action.get("clock")}
        )
    else:
        t = playtimes[player_key]["times"]
        if t:
            t[-1]["end"] = action.get("clock")
    return playtimes


def update_playtimes_with_action(action, playtimes, player_labels=None):
    player_name = fix_player_name(action)
    player_key = _player_key_from_action(action)
    action_type = action.get("actionType")

    if action_type == "Substitution":
        desc = action.get("description") or ""
        start_name = desc.find("SUB:") + 5
        end_name = desc.find("FOR") - 1
        incoming_name = desc[start_name:end_name]
        incoming_name = _normalize_special_cases(incoming_name, action.get("teamTricode"))
        incoming_key = _resolve_player_key(incoming_name, playtimes, player_labels) or _player_key_from_name(
            incoming_name
        )
        if incoming_key is None:
            return playtimes

        if incoming_key not in playtimes:
            playtimes[incoming_key] = {"times": [], "on": False}
            print("PROBLEM: Player Name Not Found", incoming_name)
        if player_labels is not None and incoming_name:
            player_labels.setdefault(incoming_key, incoming_name)

        incoming_times = playtimes[incoming_key]["times"]
        if (
            playtimes[incoming_key]["on"] is True
            and incoming_times
            and incoming_times[-1].get("end") is None
        ):
            incoming_times[-1]["end"] = action.get("clock")
        if not (
            playtimes[incoming_key]["on"] is True
            and incoming_times
            and incoming_times[-1].get("start") == action.get("clock")
            and incoming_times[-1].get("period") == action.get("period")
        ):
            incoming_times.append({"start": action.get("clock"), "period": action.get("period")})
            playtimes[incoming_key]["on"] = True

        outgoing_key = player_key
        if outgoing_key is None or outgoing_key not in playtimes:
            outgoing_key = _resolve_player_key(player_name, playtimes, player_labels) or _player_key_from_name(
                player_name
            )

        if outgoing_key and outgoing_key in playtimes:
            t = playtimes[outgoing_key]["times"]
            if _is_start_period_sub_out(action):
                if playtimes[outgoing_key]["on"] is True:
                    if (
                        t
                        and t[-1].get("start") == action.get("clock")
                        and t[-1].get("period") == action.get("period")
                    ):
                        t.pop()
                playtimes[outgoing_key]["on"] = False
                return playtimes
            if playtimes[outgoing_key]["on"] is False:
                if (action.get("period") or 0) <= 4:
                    t.append({"start": "PT12M00.00S", "period": action.get("period")})
                else:
                    t.append({"start": "PT05M00.00S", "period": action.get("period")})

            t[-1]["end"] = action.get("clock")
            playtimes[outgoing_key]["on"] = False

    elif action_type == "substitution":
        desc = action.get("description") or ""
        sub_type = _clean_phrase(action.get("subType"))
        fallback_name = desc[desc.find(":") + 2 :]
        if fallback_name == "Yang":
            fallback_name = "Hansen"

        if player_key is None or player_key not in playtimes:
            player_key = _resolve_player_key(fallback_name, playtimes, player_labels) or _player_key_from_name(
                fallback_name
            )

        if player_key is None:
            return playtimes

        if player_key not in playtimes:
            playtimes[player_key] = {"times": [], "on": False}
            print("PROBLEM: Player Name Not Found", fallback_name or player_key)
        if player_labels is not None:
            player_labels.setdefault(player_key, _display_name_from_action(action, fallback_name=fallback_name))

        t = playtimes[player_key]["times"]
        is_out = "out" in sub_type or "out:" in _clean_phrase(desc)
        is_in = "in" in sub_type or "in:" in _clean_phrase(desc)

        if is_out:
            if _is_start_period_sub_out(action):
                if playtimes[player_key]["on"] is True:
                    if (
                        t
                        and t[-1].get("start") == action.get("clock")
                        and t[-1].get("period") == action.get("period")
                    ):
                        t.pop()
                    playtimes[player_key]["on"] = False
                return playtimes
            if playtimes[player_key]["on"] is False:
                if (action.get("period") or 0) <= 4:
                    t.append({"start": "PT12M00.00S", "period": action.get("period")})
                else:
                    t.append({"start": "PT05M00.00S", "period": action.get("period")})
            if t:
                t[-1]["end"] = action.get("clock")
            playtimes[player_key]["on"] = False
        elif is_in:
            if playtimes[player_key]["on"] is True:
                if (
                    t
                    and t[-1].get("start") == action.get("clock")
                    and t[-1].get("period") == action.get("period")
                ):
                    return playtimes
                if t and t[-1].get("end") is None:
                    t[-1]["end"] = action.get("clock")
            playtimes[player_key]["times"].append({"start": action.get("clock"), "period": action.get("period")})
            playtimes[player_key]["on"] = True

    else:
        if player_key is None or player_key not in playtimes:
            player_key = _resolve_player_key(player_name, playtimes, player_labels) or _player_key_from_name(
                player_name
            )
        playtimes = update_playtime_for_key(player_key, action, playtimes)
        if action_type not in ("Assist", "assist"):
            assist_name = parse_assist_name(action)
            if assist_name:
                assist_person_id = _coerce_person_id(action.get("assistPersonId"))
                assist_key = _player_key_from_person_id(assist_person_id)
                if assist_key is None or assist_key not in playtimes:
                    assist_key = _resolve_player_key(assist_name, playtimes, player_labels) or _player_key_from_name(
                        assist_name
                    )
                if assist_key and assist_key != player_key:
                    playtimes = update_playtime_for_key(assist_key, action, playtimes)

    return playtimes


def quarter_change(playtimes):
    for player in (playtimes or {}).keys():
        if playtimes[player].get("on") is True and playtimes[player].get("times"):
            t = playtimes[player]["times"]
            t[-1]["end"] = "PT00M00.00S"
            playtimes[player]["on"] = False
    return playtimes


def _period_start_clock(period):
    return "PT12M00.00S" if (period or 0) <= 4 else "PT05M00.00S"


def quarter_change_with_carry(playtimes, next_period):
    for player in (playtimes or {}).keys():
        if playtimes[player].get("on") is True and playtimes[player].get("times"):
            t = playtimes[player]["times"]
            t[-1]["end"] = "PT00M00.00S"
            t.append({"start": _period_start_clock(next_period), "period": next_period})
            playtimes[player]["on"] = True
    return playtimes


def _is_start_period_sub_out(action):
    qualifiers = action.get("qualifiers") or []
    has_start = any(
        isinstance(q, str) and q.lower() == "startperiod" for q in qualifiers
    )
    if not has_start:
        return False
    clock = action.get("clock")
    seconds = time_to_seconds(clock)
    if seconds not in (12 * 60, 5 * 60):
        return False
    sub_type = _clean_phrase(action.get("subType"))
    desc = _clean_phrase(action.get("description"))
    if "out" in sub_type:
        return True
    if "sub out" in desc or "out:" in desc:
        return True
    return False


def end_playtimes(playtimes, last_action):
    for player in list((playtimes or {}).keys()):
        if playtimes[player].get("on") is True and playtimes[player].get("times"):
            t = playtimes[player]["times"]
            t[-1]["end"] = (last_action or {}).get("clock")
        playtimes[player] = playtimes[player].get("times", [])
    return playtimes


def sort_actions_by_order(actions):
    def sort_key(a):
        order = a.get("orderNumber")
        try:
            order = int(order)
            has_order = True
        except Exception:
            order = 0
            has_order = False

        action_num = a.get("actionNumber")
        try:
            action_num = int(action_num)
        except Exception:
            action_num = 0

        if has_order:
            return (0, order, action_num)

        period = a.get("period") or a.get("quarter") or 0
        try:
            period = int(period)
        except Exception:
            period = 0
        clock = a.get("clock") or a.get("time")
        return (1, period, -time_to_seconds(clock), action_num)

    return sorted(list(actions or []), key=sort_key)


def sort_actions(actions):
    def sort_key(a):
        period = a.get("period") or a.get("quarter") or 0
        try:
            period = int(period)
        except Exception:
            period = 0
        clock = a.get("clock") or a.get("time")
        return (period, -time_to_seconds(clock))

    return sorted(list(actions or []), key=sort_key)


def _default_player_label(player_key):
    if not isinstance(player_key, str):
        return str(player_key)
    if player_key.startswith(_PLAYER_ID_KEY_PREFIX):
        pid = _person_id_from_player_key(player_key)
        return f"Player {pid}" if pid is not None else player_key
    if player_key.startswith(_PLAYER_NAME_KEY_PREFIX):
        raw = player_key[len(_PLAYER_NAME_KEY_PREFIX) :]
        return re.sub(r"\s+", " ", raw).strip().title()
    return player_key


def _build_output_player_labels(players, player_labels):
    labels = {}
    grouped = {}

    for player_key in (players or {}).keys():
        label = (player_labels or {}).get(player_key) or _default_player_label(player_key)
        label = re.sub(r"\s+", " ", str(label or "").strip())
        if not label:
            label = _default_player_label(player_key)
        labels[player_key] = label
        grouped.setdefault(_normalize_match_name(label), []).append(player_key)

    for _, keys in grouped.items():
        if len(keys) <= 1:
            continue
        for player_key in keys:
            pid = _person_id_from_player_key(player_key)
            if pid is not None:
                labels[player_key] = f"{labels[player_key]}#{pid}"

    return labels


def _trim_action(action):
    if not isinstance(action, dict):
        return None
    action_type = _clean_phrase(action.get("actionType"))
    desc = _clean_phrase(action.get("description"))
    result = _shot_result(action, action_type, desc) if _is_shot_action(action_type, desc) else None
    payload = {
        "quarter": action.get("period"),
        "time": _trim_clock(action.get("clock")),
        "type": action.get("actionType"),
        "text": _format_action_text(action),
        "detail": action.get("subType"),
        "seq": action.get("actionNumber"),
        "awayScore": action.get("scoreAway"),
        "homeScore": action.get("scoreHome"),
    }
    if result is not None:
        payload["r"] = result
    return payload


def _trim_action_map(players, output_labels):
    trimmed = {}
    for player_key, acts in (players or {}).items():
        name = (output_labels or {}).get(player_key) or _default_player_label(player_key)
        filtered = []
        for action in acts or []:
            compact = _trim_action(action)
            if compact is not None:
                filtered.append(compact)
        trimmed[name] = filtered
    return trimmed


def _trim_action_list(actions):
    return [a for a in (_trim_action(action) for action in (actions or [])) if a is not None]


def _trim_score_timeline(score_timeline):
    trimmed = []
    for entry in score_timeline or []:
        trimmed.append(
            {
                "quarter": entry.get("period"),
                "time": _trim_clock(entry.get("clock")),
                "awayScore": entry.get("away"),
                "homeScore": entry.get("home"),
            }
        )
    return trimmed


def _trim_segments(segments, output_labels):
    trimmed = {}
    for player_key, segs in (segments or {}).items():
        name = (output_labels or {}).get(player_key) or _default_player_label(player_key)
        normalized = []
        for seg in segs or []:
            normalized.append(
                {
                    "quarter": seg.get("period"),
                    "start": _trim_clock(seg.get("start")),
                    "end": _trim_clock(seg.get("end")),
                }
            )
        trimmed[name] = normalized
    return trimmed


def infer_team_ids_from_actions(actions):
    """
    Best-effort inference of (away_team_id, home_team_id) from raw NBA PBP actions.
    Uses the common convention that location 'h' means home, 'v' means away.
    """
    actions = actions or []
    team_ids = sorted(
        {a.get("teamId") for a in actions if isinstance(a, dict) and (a.get("teamId") or 0) > 0}
    )
    if len(team_ids) != 2:
        return None, None

    counts = {team_ids[0]: {"h": 0, "v": 0}, team_ids[1]: {"h": 0, "v": 0}}
    for a in actions:
        if not isinstance(a, dict):
            continue
        tid = a.get("teamId")
        loc = a.get("location")
        if tid in counts and loc in ("h", "v"):
            counts[tid][loc] += 1

    a_id, b_id = team_ids
    if counts[a_id]["h"] > counts[b_id]["h"]:
        return b_id, a_id
    if counts[b_id]["h"] > counts[a_id]["h"]:
        return a_id, b_id
    if counts[a_id]["v"] > counts[b_id]["v"]:
        return a_id, b_id
    if counts[b_id]["v"] > counts[a_id]["v"]:
        return b_id, a_id

    return team_ids[0], team_ids[1]


def _is_target_score_game(actions):
    saw_target_period = False
    for action in actions or []:
        if not isinstance(action, dict):
            continue
        flag = action.get("isTargetScoreLastPeriod")
        if flag is True:
            saw_target_period = True
        elif flag is False:
            return False
    return saw_target_period


def _needs_target_score_clock_synthesis(actions):
    unique_seconds = {
        time_to_seconds((action or {}).get("clock"))
        for action in (actions or [])
        if isinstance(action, dict)
    }
    if not unique_seconds:
        return False
    return len(unique_seconds) == 1 and next(iter(unique_seconds)) == 0.0


def _build_target_score_remaining_seconds(actions):
    actions = list(actions or [])
    count = len(actions)
    if count == 0:
        return []
    if count == 1:
        return [0.0]

    timestamps = [_parse_time_actual(action) for action in actions]
    valid = [ts for ts in timestamps if ts is not None]
    remaining = []

    if len(valid) >= 2 and max(valid) > min(valid):
        min_ts = min(valid)
        span = max(valid) - min_ts
        for idx, ts in enumerate(timestamps):
            if ts is None:
                progress = idx / (count - 1)
            else:
                progress = (ts - min_ts) / span
            progress = max(0.0, min(1.0, progress))
            remaining.append(_TARGET_SCORE_PERIOD_SECONDS * (1.0 - progress))
    else:
        for idx in range(count):
            progress = idx / (count - 1)
            remaining.append(_TARGET_SCORE_PERIOD_SECONDS * (1.0 - progress))

    # Guard against occasional feed jitter where event timestamps are slightly out of order.
    for idx in range(1, count):
        if remaining[idx] > remaining[idx - 1]:
            remaining[idx] = remaining[idx - 1]

    remaining[0] = min(_TARGET_SCORE_PERIOD_SECONDS, max(0.0, remaining[0]))
    remaining[-1] = 0.0
    return remaining


def _apply_target_score_clocks(actions):
    actions = list(actions or [])
    if not actions or not _needs_target_score_clock_synthesis(actions):
        return actions

    remaining_seconds = _build_target_score_remaining_seconds(actions)
    normalized = []
    for action, seconds in zip(actions, remaining_seconds):
        if not isinstance(action, dict):
            normalized.append(action)
            continue
        next_action = dict(action)
        next_action["clock"] = _seconds_to_clock(seconds)
        normalized.append(next_action)
    return normalized


def process_playbyplay_payload(
    *,
    game_id,
    actions,
    away_team_id=None,
    home_team_id=None,
    away_player_labels=None,
    home_player_labels=None,
    include_actions=True,
    include_all_actions=True,
    seed_home=None,
    seed_away=None,
    seed_home_ids=None,
    seed_away_ids=None,
    seed_clock=None,
    seed_period=None,
):
    """
    Produces a compact play-by-play payload with trimmed field names.
    """
    try:
        away_team_id = int(away_team_id) if away_team_id is not None else None
    except Exception:
        away_team_id = None
    try:
        home_team_id = int(home_team_id) if home_team_id is not None else None
    except Exception:
        home_team_id = None

    actions = sort_actions_by_order(actions or [])
    is_target_score_game = _is_target_score_game(actions)
    if is_target_score_game:
        actions = _apply_target_score_clocks(actions)
    last_action = actions[-1] if actions else None
    if seed_period is None:
        seed_period = (last_action or {}).get("period") or 1
    if seed_clock is None and last_action:
        seed_clock = last_action.get("clock")
    num_periods = 1 if is_target_score_game else 4
    try:
        last_period = int((last_action or {}).get("period") or 0)
        if last_period > 0:
            if is_target_score_game:
                num_periods = max(1, last_period)
            elif last_period > 4:
                num_periods = last_period
    except Exception:
        pass

    score_timeline = process_score_timeline(actions)
    players = create_players(
        actions,
        away_team_id,
        home_team_id,
        away_player_labels=away_player_labels,
        home_player_labels=home_player_labels,
    )
    away_players = players["awayPlayers"]
    home_players = players["homePlayers"]
    away_labels = players["awayLabels"]
    home_labels = players["homeLabels"]

    if not is_target_score_game:
        _ensure_seed_players(away_players, away_labels, seed_away, seed_away_ids)
        _ensure_seed_players(home_players, home_labels, seed_home, seed_home_ids)

    away_playtimes = create_playtimes(away_players)
    home_playtimes = create_playtimes(home_players)

    current_q = 1
    for a in actions:
        period = a.get("period") or 1
        if period != current_q:
            away_playtimes = quarter_change_with_carry(away_playtimes, period)
            home_playtimes = quarter_change_with_carry(home_playtimes, period)
            current_q = period

        if away_team_id is not None and a.get("teamId") == away_team_id:
            away_playtimes = update_playtimes_with_action(a, away_playtimes, away_labels)
        if home_team_id is not None and a.get("teamId") == home_team_id:
            home_playtimes = update_playtimes_with_action(a, home_playtimes, home_labels)

    if not is_target_score_game:
        _seed_playtimes(away_playtimes, seed_away, seed_away_ids, seed_clock, seed_period)
        _seed_playtimes(home_playtimes, seed_home, seed_home_ids, seed_clock, seed_period)

    away_playtimes = end_playtimes(away_playtimes, last_action)
    home_playtimes = end_playtimes(home_playtimes, last_action)

    away_output_labels = _build_output_player_labels(away_players, away_labels)
    home_output_labels = _build_output_player_labels(home_players, home_labels)

    trimmed_away_players = _trim_action_map(away_players, away_output_labels)
    trimmed_home_players = _trim_action_map(home_players, home_output_labels)

    last_payload = None
    if last_action:
        last_payload = {
            "quarter": last_action.get("period"),
            "time": _trim_clock(last_action.get("clock")),
            "seq": last_action.get("actionNumber"),
            "awayScore": last_action.get("scoreAway"),
            "homeScore": last_action.get("scoreHome"),
        }

    payload = {
        "v": 2,
        "periods": num_periods,
        "last": last_payload,
        "score": _trim_score_timeline(score_timeline),
        "players": {
            "away": trimmed_away_players,
            "home": trimmed_home_players,
        },
        "segments": {
            "away": _trim_segments(away_playtimes, away_output_labels),
            "home": _trim_segments(home_playtimes, home_output_labels),
        },
    }

    if include_all_actions:
        all_actions = []
        for _, acts in trimmed_away_players.items():
            all_actions.extend(acts)
        for _, acts in trimmed_home_players.items():
            all_actions.extend(acts)
        payload["events"] = sort_actions(all_actions)

    if include_actions:
        payload["feed"] = _trim_action_list(actions)

    return payload
