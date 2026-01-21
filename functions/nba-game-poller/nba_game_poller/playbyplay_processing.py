import re


_CLOCK_RE = re.compile(r"PT(\d+)M(\d+)\.(\d+)S")


def time_to_seconds(clock):
    if not clock or not isinstance(clock, str):
        return 0.0
    m = _CLOCK_RE.match(clock)
    if not m:
        return 0.0
    minutes = int(m.group(1) or 0)
    seconds = int(m.group(2) or 0)
    milliseconds = int(m.group(3) or 0)
    return minutes * 60 + seconds + milliseconds / 100.0


def fix_player_name(action):
    player_name = action.get("playerName")
    description = action.get("description") or ""
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


def add_assist_actions(action, players):
    desc = action.get("description") or ""
    name = parse_assist_name(action)
    if not name:
        return players

    start_desc = desc.rfind("(") + 1
    end_desc = desc.rfind(")")
    assist_desc = desc[start_desc:end_desc] if start_desc > 0 and end_desc > start_desc else desc

    if name not in players:
        players[name] = []

    first = players[name][0] if players[name] else {}
    base_id = action.get("actionId") or action.get("actionNumber")
    assist_player_name = first.get("playerName") or name
    assist_player_name_i = first.get("playerNameI") or action.get("assistPlayerNameInitial") or name
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
    players[name].append(assist_action)
    return players


def create_players(actions, away_team_id, home_team_id):
    away_players = {}
    home_players = {}

    for a in actions or []:
        player_name = fix_player_name(a)
        if not player_name:
            continue

        team_id = a.get("teamId")
        description = a.get("description") or ""
        action_type = a.get("actionType")

        if team_id == away_team_id:
            away_players.setdefault(player_name, []).append(a)
            if "AST" in description:
                away_players = add_assist_actions(a, away_players)
            if action_type == "Substitution":
                start_name = description.find("SUB:") + 5
                end_name = description.find("FOR") - 1
                name = description[start_name:end_name]
                name = _normalize_special_cases(name, a.get("teamTricode"))
                away_players.setdefault(name, [])
        elif team_id == home_team_id:
            home_players.setdefault(player_name, []).append(a)
            if "AST" in description:
                home_players = add_assist_actions(a, home_players)
            if action_type == "Substitution":
                start_name = description.find("SUB:") + 5
                end_name = description.find("FOR") - 1
                name = description[start_name:end_name]
                name = _normalize_special_cases(name, a.get("teamTricode"))
                home_players.setdefault(name, [])

    return {"awayPlayers": away_players, "homePlayers": home_players}


def create_playtimes(players):
    playtimes = {}
    for player in (players or {}).keys():
        playtimes[player] = {"times": [], "on": False}
    return playtimes


def update_playtime_for_name(player_name, action, playtimes):
    if not player_name or player_name not in playtimes:
        return playtimes
    if playtimes[player_name]["on"] is False:
        playtimes[player_name]["on"] = True
        playtimes[player_name]["times"].append(
            {"start": "PT12M00.00S", "period": action.get("period"), "end": action.get("clock")}
        )
    else:
        t = playtimes[player_name]["times"]
        if t:
            t[-1]["end"] = action.get("clock")
    return playtimes


def update_playtimes_with_action(action, playtimes):
    player_name = fix_player_name(action)
    action_type = action.get("actionType")

    if action_type == "Substitution":
        desc = action.get("description") or ""
        start_name = desc.find("SUB:") + 5
        end_name = desc.find("FOR") - 1
        name = desc[start_name:end_name]
        name = _normalize_special_cases(name, action.get("teamTricode"))

        if name not in playtimes:
            playtimes[name] = {"times": [], "on": False}
            print("PROBLEM: Player Name Not Found", name)

        playtimes[name]["times"].append({"start": action.get("clock"), "period": action.get("period")})
        playtimes[name]["on"] = True

        if player_name and player_name in playtimes:
            t = playtimes[player_name]["times"]
            if playtimes[player_name]["on"] is False:
                if (action.get("period") or 0) <= 4:
                    t.append({"start": "PT12M00.00S", "period": action.get("period")})
                else:
                    t.append({"start": "PT05M00.00S", "period": action.get("period")})

            t[-1]["end"] = action.get("clock")
            playtimes[player_name]["on"] = False

    elif action_type == "substitution":
        desc = action.get("description") or ""
        name = desc[desc.find(":") + 2 :]
        if name == "Yang":
            name = "Hansen"

        if name not in playtimes:
            playtimes[name] = {"times": [], "on": False}
            print("PROBLEM: Player Name Not Found", name)

        t = playtimes[name]["times"]
        if "out:" in desc:
            if playtimes[name]["on"] is False:
                if (action.get("period") or 0) <= 4:
                    t.append({"start": "PT12M00.00S", "period": action.get("period")})
                else:
                    t.append({"start": "PT05M00.00S", "period": action.get("period")})
            if t:
                t[-1]["end"] = action.get("clock")
            playtimes[name]["on"] = False
        elif "in:" in desc:
            playtimes[name]["times"].append({"start": action.get("clock"), "period": action.get("period")})
            playtimes[name]["on"] = True

    else:
        playtimes = update_playtime_for_name(player_name, action, playtimes)
        if action_type not in ("Assist", "assist"):
            assist_name = parse_assist_name(action)
            if assist_name and assist_name != player_name:
                playtimes = update_playtime_for_name(assist_name, action, playtimes)

    return playtimes


def quarter_change(playtimes):
    for player in (playtimes or {}).keys():
        if playtimes[player].get("on") is True and playtimes[player].get("times"):
            t = playtimes[player]["times"]
            t[-1]["end"] = "PT00M00.00S"
            playtimes[player]["on"] = False
    return playtimes


def end_playtimes(playtimes, last_action):
    for player in list((playtimes or {}).keys()):
        if playtimes[player].get("on") is True and playtimes[player].get("times"):
            t = playtimes[player]["times"]
            t[-1]["end"] = (last_action or {}).get("clock")
        playtimes[player] = playtimes[player].get("times", [])
    return playtimes


def sort_actions(actions):
    def sort_key(a):
        period = a.get("period") or 0
        try:
            period = int(period)
        except Exception:
            period = 0
        return (period, -time_to_seconds(a.get("clock")))

    return sorted(list(actions or []), key=sort_key)


def _trim_action(action):
    if not isinstance(action, dict):
        return None
    return {
        "period": action.get("period"),
        "clock": action.get("clock"),
        "type": action.get("actionType"),
        "text": action.get("description"),
        "detail": action.get("subType"),
        "seq": action.get("actionNumber"),
        "id": action.get("actionId"),
        "awayScore": action.get("scoreAway"),
        "homeScore": action.get("scoreHome"),
    }


def _trim_action_map(players):
    trimmed = {}
    for name, acts in (players or {}).items():
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
                "period": entry.get("period"),
                "clock": entry.get("clock"),
                "awayScore": entry.get("away"),
                "homeScore": entry.get("home"),
            }
        )
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


def process_playbyplay_payload(
    *,
    game_id,
    actions,
    away_team_id=None,
    home_team_id=None,
    include_actions=True,
    include_all_actions=True,
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

    actions = actions or []
    last_action = actions[-1] if actions else None
    num_periods = 4
    try:
        if last_action and (last_action.get("period") or 0) > 4:
            num_periods = int(last_action.get("period"))
    except Exception:
        pass

    score_timeline = process_score_timeline(actions)
    players = create_players(actions, away_team_id, home_team_id)
    away_players = players["awayPlayers"]
    home_players = players["homePlayers"]

    away_playtimes = create_playtimes(away_players)
    home_playtimes = create_playtimes(home_players)

    current_q = 1
    for a in actions:
        period = a.get("period") or 1
        if period != current_q:
            away_playtimes = quarter_change(away_playtimes)
            home_playtimes = quarter_change(home_playtimes)
            current_q = period

        if away_team_id is not None and a.get("teamId") == away_team_id:
            away_playtimes = update_playtimes_with_action(a, away_playtimes)
        if home_team_id is not None and a.get("teamId") == home_team_id:
            home_playtimes = update_playtimes_with_action(a, home_playtimes)

    away_playtimes = end_playtimes(away_playtimes, last_action)
    home_playtimes = end_playtimes(home_playtimes, last_action)

    trimmed_away_players = _trim_action_map(away_players)
    trimmed_home_players = _trim_action_map(home_players)

    last_payload = None
    if last_action:
        last_payload = {
            "period": last_action.get("period"),
            "clock": last_action.get("clock"),
            "awayScore": last_action.get("scoreAway"),
            "homeScore": last_action.get("scoreHome"),
        }

    payload = {
        "v": 2,
        "game": game_id,
        "periods": num_periods,
        "last": last_payload,
        "score": _trim_score_timeline(score_timeline),
        "players": {
            "away": trimmed_away_players,
            "home": trimmed_home_players,
        },
        "segments": {
            "away": away_playtimes,
            "home": home_playtimes,
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
