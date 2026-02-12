def safe_int(value):
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return 0


def normalize_minutes(raw_minutes):
    if not raw_minutes:
        return "00:00"
    if isinstance(raw_minutes, str):
        minutes = raw_minutes.strip()
        if minutes.startswith("PT") and minutes.endswith("S"):
            stripped = minutes[2:-1]
            if "M" in stripped:
                mins_part, sec_part = stripped.split("M", 1)
                mins = safe_int(mins_part)
                secs = int(float(sec_part)) if sec_part else 0
            else:
                mins = 0
                secs = int(float(stripped)) if stripped else 0
            return f"{mins:02d}:{secs:02d}"
        if ":" in minutes:
            return minutes
    return "00:00"


def _extract_player_id(player):
    if not isinstance(player, dict):
        return None
    for key in ("personId", "playerId", "id"):
        value = safe_int(player.get(key))
        if value > 0:
            return value
    return None


def _extract_player_label(player):
    if not isinstance(player, dict):
        return ""
    first = (player.get("firstName") or player.get("first") or "").strip()
    last = (player.get("familyName") or player.get("last") or "").strip()
    full = f"{first} {last}".strip()
    if full:
        return full
    return (
        player.get("nameI")
        or player.get("name")
        or player.get("familyName")
        or player.get("last")
        or ""
    ).strip()


def build_team_payload(team):
    if not isinstance(team, dict):
        return None
    players = []
    for player in team.get("players") or []:
        if not isinstance(player, dict):
            continue
        stats = player.get("statistics") or {}
        players.append(
            {
                "id": _extract_player_id(player),
                "first": (player.get("firstName") or "").strip(),
                "last": (player.get("familyName") or "").strip(),
                "stats": {
                    "min": normalize_minutes(stats.get("minutes")),
                    "pts": safe_int(stats.get("points")),
                    "fgm": safe_int(stats.get("fieldGoalsMade")),
                    "fga": safe_int(stats.get("fieldGoalsAttempted")),
                    "tpm": safe_int(stats.get("threePointersMade")),
                    "tpa": safe_int(stats.get("threePointersAttempted")),
                    "ftm": safe_int(stats.get("freeThrowsMade")),
                    "fta": safe_int(stats.get("freeThrowsAttempted")),
                    "oreb": safe_int(stats.get("reboundsOffensive")),
                    "dreb": safe_int(stats.get("reboundsDefensive")),
                    "ast": safe_int(stats.get("assists")),
                    "stl": safe_int(stats.get("steals")),
                    "blk": safe_int(stats.get("blocks")),
                    "to": safe_int(stats.get("turnovers")),
                    "pf": safe_int(stats.get("foulsPersonal")),
                    "pm": safe_int(stats.get("plusMinusPoints")),
                },
            }
        )
    return {
        "id": team.get("teamId"),
        "abbr": team.get("teamTricode"),
        "name": team.get("teamName"),
        "players": players,
    }


def build_box_payload(box_game):
    if not isinstance(box_game, dict):
        return None
    return {
        "start": (
            box_game.get("gameEt")
            or box_game.get("gameTimeUTC")
            or box_game.get("gameDateTimeUTC")
        ),
        "teams": {
            "away": build_team_payload(box_game.get("awayTeam")),
            "home": build_team_payload(box_game.get("homeTeam")),
        },
    }


def _extract_oncourt_players(team):
    if not isinstance(team, dict):
        return []
    players = team.get("players") or []
    selected = []
    seen = set()

    def append_player(player):
        name = _extract_player_label(player)
        if not name or name in seen:
            return
        seen.add(name)
        selected.append({"id": _extract_player_id(player), "name": name})

    for player in players:
        if not isinstance(player, dict):
            continue
        if str(player.get("oncourt") or "").strip() != "1":
            continue
        append_player(player)
    if selected:
        return selected

    for player in players:
        if not isinstance(player, dict):
            continue
        if str(player.get("starter") or "").strip() != "1":
            continue
        append_player(player)
    return selected


def extract_oncourt_names(team):
    return [player.get("name") for player in _extract_oncourt_players(team) if player.get("name")]


def extract_oncourt_ids(team):
    return [player.get("id") for player in _extract_oncourt_players(team) if player.get("id")]


def build_player_label_map(team):
    labels = {}
    players = team.get("players") if isinstance(team, dict) else []
    for player in players or []:
        if not isinstance(player, dict):
            continue
        player_id = _extract_player_id(player)
        if not player_id:
            continue
        label = _extract_player_label(player)
        if label:
            labels[player_id] = label
    return labels


def _format_game_date(box_game):
    game_code = (box_game.get("gameCode") or "").strip()
    if game_code and "/" in game_code:
        date_part = game_code.split("/", 1)[0]
        if len(date_part) == 8 and date_part.isdigit():
            return f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:]}"
    game_time = (
        box_game.get("gameTimeUTC")
        or box_game.get("gameEt")
        or box_game.get("gameDateTimeUTC")
        or ""
    )
    if isinstance(game_time, str) and len(game_time) >= 10:
        return game_time[:10]
    return ""


def build_game_key(box_game, fallback_game_id):
    if not isinstance(box_game, dict):
        return fallback_game_id
    date_str = _format_game_date(box_game)
    away = (box_game.get("awayTeam") or {}).get("teamTricode")
    home = (box_game.get("homeTeam") or {}).get("teamTricode")
    away = (away or "").strip().lower()
    home = (home or "").strip().lower()
    if date_str and away and home:
        return f"{date_str}-{away}-{home}"
    return fallback_game_id
