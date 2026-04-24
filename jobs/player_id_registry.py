import re
from collections import Counter
from datetime import datetime


NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def safe_int(value):
    if value in (None, ""):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return 0


def parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def derive_season_label(date_str):
    parsed = parse_date(date_str)
    if not parsed:
        return ""
    start_year = parsed.year if parsed.month >= 10 else parsed.year - 1
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def normalize_player_name(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def slugify(value):
    text = normalize_player_name(value)
    text = NON_ALNUM_RE.sub("-", text)
    return text.strip("-")


def player_full_name(player):
    first = str((player or {}).get("first") or "").strip()
    last = str((player or {}).get("last") or "").strip()
    return f"{first} {last}".strip()


def build_identity_registry(gamepacks):
    by_team_name = {}
    by_name_counts = Counter()
    by_name_ids = {}

    for gamepack in gamepacks or []:
        teams = (((gamepack or {}).get("box") or {}).get("teams") or {})
        for side in ("away", "home"):
            team = teams.get(side) or {}
            team_abbr = str(team.get("abbr") or "").strip().upper()
            for player in team.get("players") or []:
                name = player_full_name(player)
                player_id = safe_int(player.get("id"))
                if not name or player_id <= 0:
                    continue
                normalized = normalize_player_name(name)
                by_team_name[(team_abbr, normalized)] = player_id
                by_name_counts[normalized] += 1
                by_name_ids.setdefault(normalized, set()).add(player_id)

    unique_by_name = {
        name: next(iter(ids))
        for name, ids in by_name_ids.items()
        if len(ids) == 1
    }
    return {
        "byTeamName": by_team_name,
        "uniqueByName": unique_by_name,
    }


def merge_identity_registries(registries):
    merged = {
        "byTeamName": {},
        "uniqueByName": {},
    }
    for registry in registries or []:
        if not isinstance(registry, dict):
            continue
        merged["byTeamName"].update(registry.get("byTeamName") or {})
        merged["uniqueByName"].update(registry.get("uniqueByName") or {})
    return merged


def serialize_registry(registry, *, season):
    by_team_name = registry.get("byTeamName") or {}
    unique_by_name = registry.get("uniqueByName") or {}
    return {
        "schemaVersion": 1,
        "season": season,
        "byTeamName": {
            f"{team}|{name}": player_id
            for (team, name), player_id in sorted(by_team_name.items())
        },
        "uniqueByName": dict(sorted(unique_by_name.items())),
    }


def deserialize_registry(payload):
    if not isinstance(payload, dict):
        return {"byTeamName": {}, "uniqueByName": {}}
    by_team_name = {}
    for key, player_id in (payload.get("byTeamName") or {}).items():
        if "|" not in key:
            continue
        team, name = key.split("|", 1)
        parsed_id = safe_int(player_id)
        if parsed_id > 0:
            by_team_name[(team, name)] = parsed_id
    unique_by_name = {}
    for name, player_id in (payload.get("uniqueByName") or {}).items():
        parsed_id = safe_int(player_id)
        if parsed_id > 0:
            unique_by_name[name] = parsed_id
    return {
        "byTeamName": by_team_name,
        "uniqueByName": unique_by_name,
    }


def resolve_player_id(player, team_abbr, registry):
    direct = safe_int((player or {}).get("id"))
    if direct > 0:
        return direct
    name = normalize_player_name(player_full_name(player))
    team_abbr = str(team_abbr or "").strip().upper()
    if not name:
        return None
    by_team = (registry.get("byTeamName") or {}).get((team_abbr, name))
    if safe_int(by_team) > 0:
        return safe_int(by_team)
    unique = (registry.get("uniqueByName") or {}).get(name)
    if safe_int(unique) > 0:
        return safe_int(unique)
    return None
