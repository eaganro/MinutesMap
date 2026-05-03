import gzip
import json
import re
from collections import Counter
from datetime import datetime, timezone

from botocore.exceptions import ClientError

from nba_game_poller.season_types import CANONICAL_SEASON_TYPES, derive_season_type
from nba_game_poller.storage import upload_json_to_s3


GAME_KEY_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-[a-z0-9]+-[a-z0-9]+$")


def _load_json_from_s3(*, s3_client, bucket, key, allow_missing=False):
    try:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if allow_missing and code in ("NoSuchKey", "404", "NotFound"):
            return None
        raise
    payload = resp["Body"].read()
    if payload.startswith(b"\x1f\x8b"):
        payload = gzip.decompress(payload)
    return json.loads(payload.decode("utf-8"))


def _safe_int(value):
    if value in (None, ""):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return 0


def _safe_float(value):
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _extract_date_from_game_key(game_key):
    match = GAME_KEY_RE.match((game_key or "").strip())
    return match.group(1) if match else None


def _derive_season_label(date_str):
    parsed = _parse_date(date_str)
    if not parsed:
        return ""
    start_year = parsed.year if parsed.month >= 10 else parsed.year - 1
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def _normalize_minutes(value):
    raw = str(value or "").strip()
    if not raw or ":" not in raw:
        return "00:00"
    mins, secs = raw.split(":", 1)
    return f"{_safe_int(mins):02d}:{_safe_int(secs):02d}"


def _minutes_to_seconds(value):
    mins, secs = _normalize_minutes(value).split(":", 1)
    return _safe_int(mins) * 60 + _safe_int(secs)


def _seconds_to_clock(total_seconds):
    total_seconds = max(0, _safe_int(round(total_seconds)))
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes:02d}:{seconds:02d}"


def _clock_to_seconds(value):
    raw = str(value or "").strip().upper()
    if not raw:
        return 0.0
    if raw.startswith("PT"):
        raw = raw[2:]
    if raw.endswith("S"):
        raw = raw[:-1]
    if "M" in raw:
        mins, secs = raw.split("M", 1)
        return _safe_int(mins) * 60 + _safe_float(secs)
    if ":" in raw:
        mins, secs = raw.split(":", 1)
        return _safe_int(mins) * 60 + _safe_float(secs)
    compact = re.match(r"^(\d+)(\d{2})(?:\.(\d+))?$", raw)
    if compact:
        minutes = _safe_int(compact.group(1))
        seconds = _safe_int(compact.group(2))
        fraction = compact.group(3) or "0"
        return minutes * 60 + seconds + _safe_float(f"0.{fraction}")
    return 0.0


def _normalize_player_name(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def _player_full_name(player):
    first = str((player or {}).get("first") or "").strip()
    last = str((player or {}).get("last") or "").strip()
    return f"{first} {last}".strip()


def _player_key_candidates(player):
    full = _player_full_name(player)
    first = str((player or {}).get("first") or "").strip()
    last = str((player or {}).get("last") or "").strip()
    player_id = _safe_int((player or {}).get("id"))
    candidates = []
    if full:
        candidates.append(full)
    if first and last:
        candidates.append(f"{first[:1]}. {last}")
    if full and player_id > 0:
        candidates.append(f"{full}#{player_id}")
    if first and last and player_id > 0:
        candidates.append(f"{first[:1]}. {last}#{player_id}")
    return candidates


def _resolve_player_flow_key(player, player_map):
    if not isinstance(player_map, dict):
        return None
    for candidate in _player_key_candidates(player):
        if candidate in player_map:
            return candidate
    normalized_candidates = {_normalize_player_name(candidate) for candidate in _player_key_candidates(player)}
    normalized_matches = [
        key for key in player_map.keys() if _normalize_player_name(key) in normalized_candidates
    ]
    if len(normalized_matches) == 1:
        return normalized_matches[0]
    full = _player_full_name(player)
    player_id = _safe_int((player or {}).get("id"))
    if not full:
        return None
    normalized_full = _normalize_player_name(full)
    prefix = f"{full}#"
    matches = [
        key
        for key in player_map.keys()
        if key == full
        or key.startswith(prefix)
        or _normalize_player_name(key) == normalized_full
        or _normalize_player_name(key).startswith(f"{normalized_full}#")
    ]
    if len(matches) == 1:
        return matches[0]
    if player_id > 0:
        exact = f"{full}#{player_id}"
        if exact in player_map:
            return exact
    return None


def _build_team_meta(team):
    if not isinstance(team, dict):
        return {"id": 0, "abbr": "", "name": ""}
    return {
        "id": _safe_int(team.get("id")),
        "abbr": str(team.get("abbr") or "").strip().upper(),
        "name": str(team.get("name") or "").strip(),
    }


def _build_player_box_stats(player):
    stats = ((player or {}).get("stats") or {}) if isinstance(player, dict) else {}
    oreb = _safe_int(stats.get("oreb"))
    dreb = _safe_int(stats.get("dreb"))
    return {
        "min": _normalize_minutes(stats.get("min")),
        "seconds": _minutes_to_seconds(stats.get("min")),
        "pts": _safe_int(stats.get("pts")),
        "fgm": _safe_int(stats.get("fgm")),
        "fga": _safe_int(stats.get("fga")),
        "tpm": _safe_int(stats.get("tpm")),
        "tpa": _safe_int(stats.get("tpa")),
        "ftm": _safe_int(stats.get("ftm")),
        "fta": _safe_int(stats.get("fta")),
        "oreb": oreb,
        "dreb": dreb,
        "reb": oreb + dreb,
        "ast": _safe_int(stats.get("ast")),
        "stl": _safe_int(stats.get("stl")),
        "blk": _safe_int(stats.get("blk")),
        "to": _safe_int(stats.get("to")),
        "pf": _safe_int(stats.get("pf")),
        "pm": _safe_int(stats.get("pm")),
    }


def _aggregate_team_player_stats(players):
    totals = {
        "seconds": 0,
        "pts": 0,
        "fgm": 0,
        "fga": 0,
        "tpm": 0,
        "tpa": 0,
        "ftm": 0,
        "fta": 0,
        "oreb": 0,
        "dreb": 0,
        "reb": 0,
        "ast": 0,
        "stl": 0,
        "blk": 0,
        "to": 0,
        "pf": 0,
    }
    for player in players or []:
        stats = _build_player_box_stats(player)
        for key in totals:
            totals[key] += _safe_int(stats.get(key))
    totals["min"] = _seconds_to_clock(totals["seconds"])
    return totals


def _build_team_player_rows(players):
    rows = []
    for player in players or []:
        name = _player_full_name(player)
        player_id = _safe_int(player.get("id")) or None
        if not name and player_id is None:
            continue
        rows.append(
            {
                "playerId": player_id,
                "name": name,
                "box": _build_player_box_stats(player),
            }
        )
    rows.sort(key=lambda item: (item.get("name") or "", item.get("playerId") or 0))
    return rows


def _pick_team_leader(players, stat_key):
    best = None
    for player in players or []:
        name = _player_full_name(player)
        if not name:
            continue
        value = _safe_int(_build_player_box_stats(player).get(stat_key))
        candidate = {"id": _safe_int(player.get("id")) or None, "name": name, "value": value}
        if best is None or candidate["value"] > best["value"]:
            best = candidate
    return best or {"id": None, "name": "", "value": 0}


def _player_has_output(box_stats, actions, segments):
    if box_stats.get("seconds", 0) > 0:
        return True
    numeric_keys = ("pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "reb", "ast", "stl", "blk", "to", "pf")
    if any(_safe_int(box_stats.get(key)) for key in numeric_keys):
        return True
    if actions:
        return True
    for seg in segments or []:
        if _clock_to_seconds(seg.get("start")) > _clock_to_seconds(seg.get("end")):
            return True
    return False


def _build_team_game_row(*, season, season_type, game_id, nba_game_id, start, date_str, side, team, opponent, team_players, team_score, opp_score, gamepack_key):
    team_stats = _aggregate_team_player_stats(team_players)
    return {
        "gameId": game_id,
        "nbaGameId": nba_game_id,
        "date": date_str,
        "start": start,
        "homeAway": side,
        "season": season,
        "seasonType": season_type,
        "opponentId": _safe_int(opponent.get("id")),
        "opponentAbbr": opponent.get("abbr"),
        "opponentName": opponent.get("name"),
        "result": "W" if team_score > opp_score else "L" if team_score < opp_score else "T",
        "teamScore": team_score,
        "oppScore": opp_score,
        "teamStats": team_stats,
        "leaders": {
            "pts": _pick_team_leader(team_players, "pts"),
            "reb": _pick_team_leader(team_players, "reb"),
            "ast": _pick_team_leader(team_players, "ast"),
        },
        "players": _build_team_player_rows(team_players),
        "playerCount": sum(1 for player in team_players or [] if _player_full_name(player)),
        "gamepackKey": gamepack_key,
    }


def _build_player_game_row(*, season, season_type, date_str, game_id, nba_game_id, start, gamepack_key, team, opponent, side, result, team_score, opp_score, player, box_stats, actions, segments):
    row = {
        "gameId": game_id,
        "nbaGameId": nba_game_id,
        "date": date_str,
        "start": start,
        "season": season,
        "seasonType": season_type,
        "homeAway": side,
        "result": result,
        "teamScore": team_score,
        "oppScore": opp_score,
        "teamId": _safe_int(team.get("id")),
        "teamAbbr": team.get("abbr"),
        "teamName": team.get("name"),
        "opponentId": _safe_int(opponent.get("id")),
        "opponentAbbr": opponent.get("abbr"),
        "opponentName": opponent.get("name"),
        "box": box_stats,
        "gamepackKey": gamepack_key,
        "detail": {
            "actions": actions or [],
            "segments": segments or [],
        },
    }
    row["playerId"] = _safe_int((player or {}).get("id")) or None
    row["playerKey"] = str(_safe_int((player or {}).get("id")) or "")
    return row


def _upsert_game_row(games, row):
    row = dict(row)
    game_id = row.get("gameId")
    updated = []
    replaced = False
    for existing in games or []:
        if existing.get("gameId") == game_id:
            updated.append(row)
            replaced = True
        else:
            updated.append(existing)
    if not replaced:
        updated.append(row)
    updated.sort(key=lambda item: (item.get("date") or "", item.get("start") or "", item.get("gameId") or ""))
    return updated


def _average_numeric_fields(totals, games_played, exclude=None):
    exclude = set(exclude or [])
    averages = {}
    divisor = games_played if games_played > 0 else 1
    for key, value in (totals or {}).items():
        if key in exclude:
            continue
        averages[key] = round(_safe_int(value) / divisor, 2)
    return averages


def _season_type_sort_key(item):
    season_type = item[0] if isinstance(item, tuple) else item
    try:
        return (0, CANONICAL_SEASON_TYPES.index(season_type))
    except ValueError:
        return (1, str(season_type))


def _game_season_type(game):
    return derive_season_type(game, nba_game_id=(game or {}).get("nbaGameId"))


def _is_played_team_game(game):
    return not (isinstance(game, dict) and game.get("played") is False)


def _new_team_split_bucket():
    return {
        "games": 0,
        "wins": 0,
        "losses": 0,
        "ties": 0,
        "totals": Counter(),
        "players": {},
    }


def _accumulate_team_player(players, player):
    player_id = _safe_int(player.get("playerId")) or None
    name = str(player.get("name") or "").strip()
    player_key = player_id if player_id is not None else f"name:{name.lower()}"
    if player_key not in players:
        players[player_key] = {
            "playerId": player_id,
            "name": name,
            "games": 0,
            "box": Counter(),
        }
    entry = players[player_key]
    entry["games"] += 1
    for key, value in ((player.get("box") or {}).items()):
        if key == "min":
            continue
        entry["box"][key] += _safe_int(value)


def _team_players_summary(players):
    season_players = []
    for entry in players.values():
        box_totals = dict(entry["box"])
        if "seconds" in box_totals:
            box_totals["min"] = _seconds_to_clock(box_totals["seconds"])
        averages = _average_numeric_fields(box_totals, entry["games"], exclude={"seconds"})
        if "seconds" in box_totals and entry["games"]:
            averages["min"] = _seconds_to_clock(_safe_int(round(box_totals["seconds"] / entry["games"])))
        season_players.append(
            {
                "playerId": entry["playerId"],
                "name": entry["name"],
                "games": entry["games"],
                "box": box_totals,
                "averages": averages,
            }
        )
    season_players.sort(
        key=lambda item: (
            -_safe_int((item.get("box") or {}).get("pts")),
            -(item.get("games") or 0),
            item.get("name") or "",
        )
    )
    return season_players


def _finalize_team_split(bucket):
    totals_dict = dict(bucket["totals"])
    if "seconds" in totals_dict:
        totals_dict["min"] = _seconds_to_clock(totals_dict["seconds"])
    averages = _average_numeric_fields(totals_dict, bucket["games"], exclude={"seconds"})
    if "seconds" in totals_dict and bucket["games"]:
        averages["min"] = _seconds_to_clock(_safe_int(round(totals_dict["seconds"] / bucket["games"])))
    return {
        "games": bucket["games"],
        "record": {"wins": bucket["wins"], "losses": bucket["losses"], "ties": bucket["ties"]},
        "totals": totals_dict,
        "averages": averages,
        "players": _team_players_summary(bucket["players"]),
    }


def _new_player_split_bucket():
    return {
        "games": 0,
        "wins": 0,
        "losses": 0,
        "ties": 0,
        "box": Counter(),
        "teams": {},
    }


def _finalize_player_split(bucket):
    box_totals = dict(bucket["box"])
    if "seconds" in box_totals:
        box_totals["min"] = _seconds_to_clock(box_totals["seconds"])
    averages_box = _average_numeric_fields(dict(bucket["box"]), bucket["games"], exclude={"seconds"})
    if "seconds" in bucket["box"] and bucket["games"]:
        averages_box["min"] = _seconds_to_clock(_safe_int(round(bucket["box"]["seconds"] / bucket["games"])))
    return {
        "games": bucket["games"],
        "teams": sorted(bucket["teams"].values(), key=lambda item: (item["abbr"], item["id"])),
        "record": {"wins": bucket["wins"], "losses": bucket["losses"], "ties": bucket["ties"]},
        "totals": {
            "games": bucket["games"],
            "wins": bucket["wins"],
            "losses": bucket["losses"],
            "ties": bucket["ties"],
            "box": box_totals,
        },
        "averages": {"box": averages_box},
    }


def _recalc_team_artifact(artifact):
    games = list(artifact.get("games") or [])
    totals = Counter()
    players = {}
    by_season_type = {}
    wins = losses = ties = 0
    running_wins = running_losses = running_ties = 0
    for game in games:
        season_type = _game_season_type(game)
        game["seasonType"] = season_type
        if not _is_played_team_game(game):
            game["recordAfter"] = {"wins": running_wins, "losses": running_losses, "ties": running_ties}
            game["recordAfterBySeasonType"] = None
            continue
        split = by_season_type.setdefault(season_type, _new_team_split_bucket())
        split["games"] += 1
        result = game.get("result")
        if result == "W":
            wins += 1
            running_wins += 1
            split["wins"] += 1
        elif result == "L":
            losses += 1
            running_losses += 1
            split["losses"] += 1
        else:
            ties += 1
            running_ties += 1
            split["ties"] += 1
        game["recordAfter"] = {"wins": running_wins, "losses": running_losses, "ties": running_ties}
        game["recordAfterBySeasonType"] = {
            "wins": split["wins"],
            "losses": split["losses"],
            "ties": split["ties"],
        }
        totals["pointsFor"] += _safe_int(game.get("teamScore"))
        totals["pointsAgainst"] += _safe_int(game.get("oppScore"))
        split["totals"]["pointsFor"] += _safe_int(game.get("teamScore"))
        split["totals"]["pointsAgainst"] += _safe_int(game.get("oppScore"))
        for key, value in ((game.get("teamStats") or {}).items()):
            totals[key] += _safe_int(value)
            split["totals"][key] += _safe_int(value)
        for player in game.get("players") or []:
            _accumulate_team_player(players, player)
            _accumulate_team_player(split["players"], player)
    totals_dict = dict(totals)
    if "seconds" in totals_dict:
        totals_dict["min"] = _seconds_to_clock(totals_dict["seconds"])
    artifact["games"] = games
    artifact["players"] = _team_players_summary(players)
    artifact["record"] = {"wins": wins, "losses": losses, "ties": ties}
    artifact["totals"] = totals_dict
    played_games = wins + losses + ties
    artifact["averages"] = _average_numeric_fields(totals_dict, played_games, exclude={"seconds"})
    if "seconds" in totals_dict and played_games:
        artifact["averages"]["min"] = _seconds_to_clock(_safe_int(round(totals_dict["seconds"] / played_games)))
    artifact["bySeasonType"] = {
        season_type: _finalize_team_split(bucket)
        for season_type, bucket in sorted(by_season_type.items(), key=_season_type_sort_key)
    }
    artifact["updatedAt"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return artifact


def _recalc_player_artifact(artifact):
    games = list(artifact.get("games") or [])
    totals_box = Counter()
    wins = losses = ties = 0
    teams = {}
    by_season_type = {}
    for game in games:
        season_type = _game_season_type(game)
        game["seasonType"] = season_type
        split = by_season_type.setdefault(season_type, _new_player_split_bucket())
        split["games"] += 1
        result = game.get("result")
        if result == "W":
            wins += 1
            split["wins"] += 1
        elif result == "L":
            losses += 1
            split["losses"] += 1
        else:
            ties += 1
            split["ties"] += 1
        team_id = _safe_int(game.get("teamId"))
        team_abbr = str(game.get("teamAbbr") or "").strip().upper()
        team_name = str(game.get("teamName") or "").strip()
        if team_id > 0 or team_abbr or team_name:
            teams[(team_id, team_abbr)] = {"id": team_id, "abbr": team_abbr, "name": team_name}
            split["teams"][(team_id, team_abbr)] = {"id": team_id, "abbr": team_abbr, "name": team_name}
        for key, value in ((game.get("box") or {}).items()):
            if key == "min":
                continue
            totals_box[key] += _safe_int(value)
            split["box"][key] += _safe_int(value)
    games_played = len(games)
    totals = {"games": games_played, "wins": wins, "losses": losses, "ties": ties, "box": dict(totals_box)}
    if "seconds" in totals["box"]:
        totals["box"]["min"] = _seconds_to_clock(totals["box"]["seconds"])
    averages = {"box": _average_numeric_fields(dict(totals_box), games_played, exclude={"seconds"})}
    if "seconds" in totals_box and games_played:
        averages["box"]["min"] = _seconds_to_clock(_safe_int(round(totals_box["seconds"] / games_played)))
    artifact["games"] = games
    artifact["teams"] = sorted(teams.values(), key=lambda item: (item["abbr"], item["id"]))
    artifact["record"] = {"wins": wins, "losses": losses, "ties": ties}
    artifact["totals"] = totals
    artifact["averages"] = averages
    artifact["bySeasonType"] = {
        season_type: _finalize_player_split(bucket)
        for season_type, bucket in sorted(by_season_type.items(), key=_season_type_sort_key)
    }
    artifact["updatedAt"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return artifact


def _init_team_artifact(team, season):
    return {
        "schemaVersion": 1,
        "updatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "season": season,
        "team": {"id": _safe_int(team.get("id")), "abbr": team.get("abbr"), "name": team.get("name")},
        "games": [],
        "players": [],
        "record": {"wins": 0, "losses": 0, "ties": 0},
        "totals": {},
        "averages": {},
        "bySeasonType": {},
    }


def _init_player_artifact(player, season):
    return {
        "schemaVersion": 1,
        "updatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "season": season,
        "player": {
            "id": _safe_int(player.get("id")) or None,
            "key": str(player.get("key") or "").strip(),
            "first": player.get("first"),
            "last": player.get("last"),
            "name": player.get("name"),
        },
        "teams": [],
        "games": [],
        "record": {"wins": 0, "losses": 0, "ties": 0},
        "totals": {},
        "averages": {},
        "bySeasonType": {},
    }


def _season_key_for_team(page_prefix, team_abbr, season):
    return f"{page_prefix}teams/{team_abbr}/{season}.json"


def _season_key_for_player(page_prefix, player_id, season):
    return f"{page_prefix}players/{player_id}/{season}.json"


def _load_or_init_team_artifact(*, s3_client, bucket, root_prefix, key, team, season):
    existing = _load_json_from_s3(
        s3_client=s3_client,
        bucket=bucket,
        key=f"{root_prefix}{key}.gz",
        allow_missing=True,
    )
    return existing if isinstance(existing, dict) else _init_team_artifact(team, season)


def _load_or_init_player_artifact(*, s3_client, bucket, root_prefix, key, player, season):
    existing = _load_json_from_s3(
        s3_client=s3_client,
        bucket=bucket,
        key=f"{root_prefix}{key}.gz",
        allow_missing=True,
    )
    return existing if isinstance(existing, dict) else _init_player_artifact(player, season)


def update_page_artifacts_for_gamepack(*, s3_client, bucket, root_prefix, page_prefix, gamepack):
    if not isinstance(gamepack, dict):
        raise ValueError("Gamepack payload must be an object.")

    box = gamepack.get("box") or {}
    flow = gamepack.get("flow") or {}
    teams = box.get("teams") or {}
    away_team = _build_team_meta(teams.get("away"))
    home_team = _build_team_meta(teams.get("home"))
    away_players = (teams.get("away") or {}).get("players") or []
    home_players = (teams.get("home") or {}).get("players") or []
    away_player_map = ((flow.get("players") or {}).get("away") or {}) if isinstance(flow, dict) else {}
    home_player_map = ((flow.get("players") or {}).get("home") or {}) if isinstance(flow, dict) else {}
    away_segments_map = ((flow.get("segments") or {}).get("away") or {}) if isinstance(flow, dict) else {}
    home_segments_map = ((flow.get("segments") or {}).get("home") or {}) if isinstance(flow, dict) else {}

    game_id = str(gamepack.get("publicId") or "").strip()
    nba_game_id = str(gamepack.get("id") or gamepack.get("nbaGameId") or "").strip()
    start = str(box.get("start") or "").strip() or None
    date_str = _extract_date_from_game_key(game_id) or (start[:10] if start and len(start) >= 10 else "")
    if not date_str:
        raise ValueError(f"Could not determine game date for {game_id or nba_game_id}.")
    season = _derive_season_label(date_str)
    season_type = derive_season_type(gamepack, box, nba_game_id=nba_game_id)
    gamepack_key = f"{root_prefix}gamepack/{game_id}.json.gz"

    last = flow.get("last") or {}
    away_score = _safe_int(last.get("awayScore"))
    home_score = _safe_int(last.get("homeScore"))
    if away_score == 0 and home_score == 0:
        away_score = _aggregate_team_player_stats(away_players).get("pts", 0)
        home_score = _aggregate_team_player_stats(home_players).get("pts", 0)

    team_updates = [
        ("away", away_team, home_team, away_players, away_score, home_score),
        ("home", home_team, away_team, home_players, home_score, away_score),
    ]
    team_writes = 0
    player_writes = 0
    affected_teams = []
    affected_players = []

    for side, team, opponent, team_players, team_score, opp_score in team_updates:
        team_abbr = str(team.get("abbr") or "").strip().upper()
        key = _season_key_for_team(page_prefix, team.get("abbr"), season)
        artifact = _load_or_init_team_artifact(
            s3_client=s3_client,
            bucket=bucket,
            root_prefix=root_prefix,
            key=key,
            team=team,
            season=season,
        )
        row = _build_team_game_row(
            season=season,
            season_type=season_type,
            game_id=game_id,
            nba_game_id=nba_game_id,
            start=start,
            date_str=date_str,
            side=side,
            team=team,
            opponent=opponent,
            team_players=team_players,
            team_score=team_score,
            opp_score=opp_score,
            gamepack_key=gamepack_key,
        )
        artifact["games"] = _upsert_game_row(artifact.get("games"), row)
        _recalc_team_artifact(artifact)
        upload_json_to_s3(
            s3_client=s3_client,
            bucket=bucket,
            prefix=root_prefix,
            key=key,
            data=artifact,
            is_final=False,
        )
        team_writes += 1
        if team_abbr and team_abbr not in affected_teams:
            affected_teams.append(team_abbr)

    player_inputs = [
        (away_team, home_team, "away", away_score, home_score, away_players, away_player_map, away_segments_map),
        (home_team, away_team, "home", home_score, away_score, home_players, home_player_map, home_segments_map),
    ]
    for team, opponent, side, team_score, opp_score, team_players, player_map, segments_map in player_inputs:
        result = "W" if team_score > opp_score else "L" if team_score < opp_score else "T"
        for player in team_players or []:
            box_stats = _build_player_box_stats(player)
            flow_key = _resolve_player_flow_key(player, player_map)
            actions = list(player_map.get(flow_key) or []) if flow_key else []
            segments = list(segments_map.get(flow_key) or []) if flow_key else []
            if not _player_has_output(box_stats, actions, segments):
                continue
            player_id = _safe_int(player.get("id"))
            if player_id <= 0:
                continue
            key = _season_key_for_player(page_prefix, player_id, season)
            player_meta = {
                "id": player_id,
                "key": str(player_id),
                "first": str(player.get("first") or "").strip(),
                "last": str(player.get("last") or "").strip(),
                "name": _player_full_name(player),
            }
            artifact = _load_or_init_player_artifact(
                s3_client=s3_client,
                bucket=bucket,
                root_prefix=root_prefix,
                key=key,
                player=player_meta,
                season=season,
            )
            row = _build_player_game_row(
                season=season,
                season_type=season_type,
                date_str=date_str,
                game_id=game_id,
                nba_game_id=nba_game_id,
                start=start,
                gamepack_key=gamepack_key,
                team=team,
                opponent=opponent,
                side=side,
                result=result,
                team_score=team_score,
                opp_score=opp_score,
                player=player,
                box_stats=box_stats,
                actions=actions,
                segments=segments,
            )
            artifact["games"] = _upsert_game_row(artifact.get("games"), row)
            _recalc_player_artifact(artifact)
            upload_json_to_s3(
                s3_client=s3_client,
                bucket=bucket,
                prefix=root_prefix,
                key=key,
                data=artifact,
                is_final=False,
            )
            player_writes += 1
            if player_id not in affected_players:
                affected_players.append(player_id)

    return {
        "teamFiles": team_writes,
        "playerFiles": player_writes,
        "teams": affected_teams,
        "players": affected_players,
        "gameId": game_id,
        "season": season,
        "seasonType": season_type,
    }
