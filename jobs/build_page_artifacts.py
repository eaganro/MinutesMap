import argparse
import gzip
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError

ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, "functions", "nba-game-poller"))

from nba_game_poller.season_types import CANONICAL_SEASON_TYPES, derive_season_type  # noqa: E402
from nba_game_poller.storage import upload_json_to_s3  # noqa: E402

DEFAULT_PREFIX = "data/"
DEFAULT_GAMEPACK_PREFIX = "gamepack/"
DEFAULT_PAGE_PREFIX = "pages/"
DEFAULT_SCHEDULE_PREFIX = "schedule/"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
GAME_KEY_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-[a-z0-9]+-[a-z0-9]+$")
NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build team/player page artifacts from finalized gamepacks."
    )
    parser.add_argument(
        "--game-key",
        action="append",
        default=[],
        help="Public game key to process, e.g. 2026-02-03-phi-gsw. May be repeated.",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="NBA date in YYYY-MM-DD (single date run).",
    )
    parser.add_argument(
        "--start-date",
        default=None,
        help="Start date in YYYY-MM-DD (inclusive).",
    )
    parser.add_argument(
        "--end-date",
        default=None,
        help="End date in YYYY-MM-DD (inclusive).",
    )
    parser.add_argument(
        "--all-s3",
        action="store_true",
        help="Process every date that has a schedule file in S3.",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("DATA_BUCKET", "roryeagan.com-nba-processed-data"),
        help="S3 bucket for reads/writes.",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", "us-east-1"),
        help="AWS region.",
    )
    parser.add_argument(
        "--prefix",
        default=DEFAULT_PREFIX,
        help="Root S3 prefix for processed data (default: data/).",
    )
    parser.add_argument(
        "--gamepack-prefix",
        default=DEFAULT_GAMEPACK_PREFIX,
        help="Gamepack prefix relative to --prefix (default: gamepack/).",
    )
    parser.add_argument(
        "--page-prefix",
        default=DEFAULT_PAGE_PREFIX,
        help="Page artifact prefix relative to --prefix (default: pages/).",
    )
    parser.add_argument(
        "--schedule-prefix",
        default=DEFAULT_SCHEDULE_PREFIX,
        help="Schedule prefix at bucket root (default: schedule/).",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Store only per-game summaries in player season files (omit actions/segments).",
    )
    parser.add_argument(
        "--teams-only",
        action="store_true",
        help="Update only team season files and skip player season files.",
    )
    parser.add_argument(
        "--include-non-final",
        action="store_true",
        help="Process games even when schedule status is not final.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be updated without writing to S3.",
    )
    parser.add_argument(
        "--max-dates",
        type=int,
        default=None,
        help="Optional date cap for backfill safety.",
    )
    return parser.parse_args()


def ensure_trailing_slash(value):
    if not value:
        return ""
    return value if value.endswith("/") else f"{value}/"


def gunzip_payload(payload):
    if payload.startswith(b"\x1f\x8b"):
        return gzip.decompress(payload)
    return payload


def load_json_from_s3(*, s3_client, bucket, key, allow_missing=False):
    try:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if allow_missing and code in ("NoSuchKey", "404", "NotFound"):
            return None
        raise
    payload = resp["Body"].read()
    payload = gunzip_payload(payload)
    return json.loads(payload.decode("utf-8"))


def list_schedule_dates_from_s3(s3_client, bucket, prefix):
    dates = []
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for entry in page.get("Contents", []) or []:
            key = entry.get("Key") or ""
            if not key.startswith(prefix):
                continue
            name = key[len(prefix) :]
            if not name.endswith(".json.gz"):
                continue
            date_part = name[: -len(".json.gz")]
            if DATE_RE.match(date_part):
                dates.append(date_part)
    return sorted(set(dates))


def load_schedule_from_s3(s3_client, bucket, date_str, prefix):
    key = f"{prefix}{date_str}.json.gz"
    data = load_json_from_s3(
        s3_client=s3_client,
        bucket=bucket,
        key=key,
        allow_missing=True,
    )
    return data if isinstance(data, list) else []


def parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def expand_date_range(start_date, end_date):
    start = parse_date(start_date)
    end = parse_date(end_date)
    if not start or not end or end < start:
        return []
    days = (end - start).days
    return [(start + timedelta(days=offset)).isoformat() for offset in range(days + 1)]


def extract_date_from_game_key(game_key):
    match = GAME_KEY_RE.match((game_key or "").strip())
    return match.group(1) if match else None


def is_final_schedule_game(game):
    status = str((game or {}).get("status") or "").strip().lower()
    return status.startswith("final")


def is_cancelled_schedule_game(game):
    status = str((game or {}).get("status") or "").strip().lower()
    return status.startswith(("postponed", "cancelled", "canceled", "ppd"))


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


def safe_float(value):
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def normalize_minutes(value):
    raw = str(value or "").strip()
    if not raw:
        return "00:00"
    if ":" not in raw:
        return "00:00"
    mins, secs = raw.split(":", 1)
    return f"{safe_int(mins):02d}:{safe_int(secs):02d}"


def minutes_to_seconds(value):
    normalized = normalize_minutes(value)
    mins, secs = normalized.split(":", 1)
    return safe_int(mins) * 60 + safe_int(secs)


def seconds_to_clock(total_seconds):
    total_seconds = max(0, safe_int(round(total_seconds)))
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes:02d}:{seconds:02d}"


def clock_to_seconds(value):
    raw = str(value or "").strip().upper()
    if not raw:
        return 0.0
    if raw.startswith("PT"):
        raw = raw[2:]
    if raw.endswith("S"):
        raw = raw[:-1]
    if "M" in raw:
        mins, secs = raw.split("M", 1)
        return safe_int(mins) * 60 + safe_float(secs)
    if ":" in raw:
        mins, secs = raw.split(":", 1)
        return safe_int(mins) * 60 + safe_float(secs)
    compact = re.match(r"^(\d+)(\d{2})(?:\.(\d+))?$", raw)
    if compact:
        minutes = safe_int(compact.group(1))
        seconds = safe_int(compact.group(2))
        fraction = compact.group(3) or "0"
        return minutes * 60 + seconds + safe_float(f"0.{fraction}")
    return 0.0


def iso_utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso_datetime(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def is_future_schedule_game(game, *, now=None):
    if not isinstance(game, dict) or is_final_schedule_game(game) or is_cancelled_schedule_game(game):
        return False
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now = now.astimezone(timezone.utc)
    start = parse_iso_datetime(game.get("starttime"))
    if start:
        return start > now
    game_date = parse_date(game.get("date"))
    if game_date:
        return game_date > now.date()
    return False


def derive_season_label(date_str):
    parsed = parse_date(date_str)
    if not parsed:
        return ""
    start_year = parsed.year if parsed.month >= 10 else parsed.year - 1
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def player_full_name(player):
    first = str((player or {}).get("first") or "").strip()
    last = str((player or {}).get("last") or "").strip()
    full = f"{first} {last}".strip()
    return full


def normalize_player_name(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def slugify(value):
    text = normalize_player_name(value)
    text = NON_ALNUM_RE.sub("-", text)
    return text.strip("-")


def player_key_candidates(player):
    full = player_full_name(player)
    first = str((player or {}).get("first") or "").strip()
    last = str((player or {}).get("last") or "").strip()
    player_id = safe_int((player or {}).get("id"))
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


def resolve_player_flow_key(player, player_map):
    if not isinstance(player_map, dict):
        return None
    for candidate in player_key_candidates(player):
        if candidate in player_map:
            return candidate
    normalized_candidates = {normalize_player_name(candidate) for candidate in player_key_candidates(player)}
    normalized_matches = [
        key for key in player_map.keys() if normalize_player_name(key) in normalized_candidates
    ]
    if len(normalized_matches) == 1:
        return normalized_matches[0]
    full = player_full_name(player)
    player_id = safe_int((player or {}).get("id"))
    if not full:
        return None
    normalized_full = normalize_player_name(full)
    prefix = f"{full}#"
    matches = [
        key
        for key in player_map.keys()
        if key == full
        or key.startswith(prefix)
        or normalize_player_name(key) == normalized_full
        or normalize_player_name(key).startswith(f"{normalized_full}#")
    ]
    if len(matches) == 1:
        return matches[0]
    if player_id > 0:
        exact = f"{full}#{player_id}"
        if exact in player_map:
            return exact
    return None


def build_identity_registry(gamepacks):
    by_team_name = {}
    by_name_ids = {}

    for gamepack in gamepacks or []:
        box = (gamepack or {}).get("box") or {}
        teams = box.get("teams") or {}
        for side in ("away", "home"):
            team = teams.get(side) or {}
            team_abbr = str(team.get("abbr") or "").strip().upper()
            for player in team.get("players") or []:
                full_name = player_full_name(player)
                if not full_name:
                    continue
                player_id = safe_int(player.get("id"))
                if player_id <= 0:
                    continue
                normalized_name = normalize_player_name(full_name)
                if team_abbr:
                    by_team_name[(team_abbr, normalized_name)] = player_id
                by_name_ids.setdefault(normalized_name, set()).add(player_id)

    unique_by_name = {
        name: next(iter(ids))
        for name, ids in by_name_ids.items()
        if len(ids) == 1
    }
    return {
        "byTeamName": by_team_name,
        "uniqueByName": unique_by_name,
    }


def resolve_player_identity(player, team_abbr, registry):
    full_name = player_full_name(player)
    official_id = safe_int((player or {}).get("id"))
    normalized_name = normalize_player_name(full_name)
    team_abbr = str(team_abbr or "").strip().upper()

    if official_id <= 0 and normalized_name:
        official_id = safe_int((registry.get("byTeamName") or {}).get((team_abbr, normalized_name)))
    if official_id <= 0 and normalized_name:
        official_id = safe_int((registry.get("uniqueByName") or {}).get(normalized_name))

    return {
        "id": official_id or None,
        "key": str(official_id) if official_id > 0 else f"name-{slugify(full_name) or 'unknown'}",
        "name": full_name,
    }


def build_team_meta(team):
    if not isinstance(team, dict):
        return {"id": 0, "abbr": "", "name": ""}
    return {
        "id": safe_int(team.get("id")),
        "abbr": str(team.get("abbr") or "").strip().upper(),
        "name": str(team.get("name") or "").strip(),
    }


def build_player_box_stats(player):
    stats = ((player or {}).get("stats") or {}) if isinstance(player, dict) else {}
    oreb = safe_int(stats.get("oreb"))
    dreb = safe_int(stats.get("dreb"))
    return {
        "min": normalize_minutes(stats.get("min")),
        "seconds": minutes_to_seconds(stats.get("min")),
        "pts": safe_int(stats.get("pts")),
        "fgm": safe_int(stats.get("fgm")),
        "fga": safe_int(stats.get("fga")),
        "tpm": safe_int(stats.get("tpm")),
        "tpa": safe_int(stats.get("tpa")),
        "ftm": safe_int(stats.get("ftm")),
        "fta": safe_int(stats.get("fta")),
        "oreb": oreb,
        "dreb": dreb,
        "reb": oreb + dreb,
        "ast": safe_int(stats.get("ast")),
        "stl": safe_int(stats.get("stl")),
        "blk": safe_int(stats.get("blk")),
        "to": safe_int(stats.get("to")),
        "pf": safe_int(stats.get("pf")),
        "pm": safe_int(stats.get("pm")),
    }


def summarize_segments(segments):
    periods = sorted({safe_int(seg.get("quarter")) for seg in (segments or []) if safe_int(seg.get("quarter")) > 0})
    seconds = 0.0
    for seg in segments or []:
        start = clock_to_seconds(seg.get("start"))
        end = clock_to_seconds(seg.get("end"))
        if start >= end:
            seconds += start - end
    return {
        "stints": len(segments or []),
        "periods": periods,
        "seconds": safe_int(round(seconds)),
    }


def summarize_actions(actions):
    counts = Counter()
    summary = {
        "actionCount": len(actions or []),
        "made2": 0,
        "missed2": 0,
        "made3": 0,
        "missed3": 0,
        "madeFt": 0,
        "missedFt": 0,
        "assists": 0,
        "rebounds": 0,
        "offRebounds": 0,
        "defRebounds": 0,
        "turnovers": 0,
        "steals": 0,
        "blocks": 0,
        "fouls": 0,
        "substitutions": 0,
        "violations": 0,
    }
    for action in actions or []:
        action_type = str(action.get("type") or "").strip().lower()
        text = str(action.get("text") or "").strip().lower()
        result = str(action.get("r") or "").strip().lower()
        if action_type:
            counts[action_type] += 1
        if action_type == "2pt":
            if result == "m":
                summary["made2"] += 1
            elif result == "x":
                summary["missed2"] += 1
        elif action_type == "3pt":
            if result == "m":
                summary["made3"] += 1
            elif result == "x":
                summary["missed3"] += 1
        elif action_type in ("free throw", "freethrow"):
            if result == "m":
                summary["madeFt"] += 1
            elif result == "x":
                summary["missedFt"] += 1
        elif "assist" in action_type:
            summary["assists"] += 1
        elif "rebound" in action_type:
            summary["rebounds"] += 1
            if text.endswith(" reb off") or " reb off" in text:
                summary["offRebounds"] += 1
            elif text.endswith(" reb def") or " reb def" in text:
                summary["defRebounds"] += 1
        elif "turnover" in action_type:
            summary["turnovers"] += 1
        elif "steal" in action_type:
            summary["steals"] += 1
        elif "block" in action_type:
            summary["blocks"] += 1
        elif "foul" in action_type:
            summary["fouls"] += 1
        elif "substitution" in action_type:
            summary["substitutions"] += 1
        elif "violation" in action_type:
            summary["violations"] += 1
    summary["pointsFromMadeShots"] = (
        summary["made2"] * 2 + summary["made3"] * 3 + summary["madeFt"]
    )
    summary["actionCounts"] = dict(sorted(counts.items()))
    return summary


def summarize_player_pbp(actions, segments):
    segment_summary = summarize_segments(segments)
    action_summary = summarize_actions(actions)
    return {
        **action_summary,
        "stints": segment_summary["stints"],
        "seconds": segment_summary["seconds"],
        "periods": segment_summary["periods"],
    }


def player_has_output(box_stats, pbp_summary):
    if box_stats.get("seconds", 0) > 0:
        return True
    numeric_keys = (
        "pts",
        "fgm",
        "fga",
        "tpm",
        "tpa",
        "ftm",
        "fta",
        "reb",
        "ast",
        "stl",
        "blk",
        "to",
        "pf",
    )
    if any(safe_int(box_stats.get(key)) for key in numeric_keys):
        return True
    return safe_int(pbp_summary.get("actionCount")) > 0 or safe_int(pbp_summary.get("seconds")) > 0


def aggregate_team_player_stats(players):
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
        stats = build_player_box_stats(player)
        for key in totals.keys():
            totals[key] += safe_int(stats.get(key))
    totals["min"] = seconds_to_clock(totals["seconds"])
    return totals


def build_team_player_rows(players):
    rows = []
    for player in players or []:
        name = player_full_name(player)
        player_id = safe_int(player.get("id")) or None
        if not name and player_id is None:
            continue
        rows.append(
            {
                "playerId": player_id,
                "name": name,
                "box": build_player_box_stats(player),
            }
        )
    rows.sort(key=lambda item: (item.get("name") or "", item.get("playerId") or 0))
    return rows


def pick_team_leader(players, stat_key):
    best = None
    for player in players or []:
        name = player_full_name(player)
        if not name:
            continue
        stats = build_player_box_stats(player)
        value = safe_int(stats.get(stat_key))
        candidate = {"id": safe_int(player.get("id")) or None, "name": name, "value": value}
        if best is None or candidate["value"] > best["value"]:
            best = candidate
    return best or {"id": None, "name": "", "value": 0}


def build_team_game_row(
    *,
    season,
    season_type,
    game_id,
    nba_game_id,
    start,
    date_str,
    side,
    team,
    opponent,
    team_players,
    team_score,
    opp_score,
    gamepack_key,
):
    team_stats = aggregate_team_player_stats(team_players)
    return {
        "gameId": game_id,
        "nbaGameId": nba_game_id,
        "date": date_str,
        "start": start,
        "homeAway": side,
        "season": season,
        "seasonType": season_type,
        "opponentId": safe_int(opponent.get("id")),
        "opponentAbbr": opponent.get("abbr"),
        "opponentName": opponent.get("name"),
        "result": "W" if team_score > opp_score else "L" if team_score < opp_score else "T",
        "teamScore": team_score,
        "oppScore": opp_score,
        "teamStats": team_stats,
        "leaders": {
            "pts": pick_team_leader(team_players, "pts"),
            "reb": pick_team_leader(team_players, "reb"),
            "ast": pick_team_leader(team_players, "ast"),
        },
        "players": build_team_player_rows(team_players),
        "playerCount": sum(1 for player in team_players or [] if player_full_name(player)),
        "gamepackKey": gamepack_key,
    }


def build_scheduled_team_game_row(
    *,
    season,
    season_type,
    schedule_game,
    side,
    opponent,
):
    if side == "home":
        team_score = safe_int(schedule_game.get("homescore"))
        opp_score = safe_int(schedule_game.get("awayscore"))
    else:
        team_score = safe_int(schedule_game.get("awayscore"))
        opp_score = safe_int(schedule_game.get("homescore"))
    return {
        "gameId": str(schedule_game.get("id") or "").strip(),
        "nbaGameId": str(schedule_game.get("nbaGameId") or "").strip(),
        "date": str(schedule_game.get("date") or "").strip(),
        "start": str(schedule_game.get("starttime") or "").strip() or None,
        "homeAway": side,
        "season": season,
        "seasonType": season_type,
        "opponentId": safe_int(opponent.get("id")),
        "opponentAbbr": opponent.get("abbr"),
        "opponentName": opponent.get("name"),
        "status": str(schedule_game.get("status") or "").strip(),
        "played": False,
        "result": None,
        "teamScore": team_score,
        "oppScore": opp_score,
        "teamStats": {},
        "leaders": {},
        "players": [],
        "playerCount": 0,
        "gamepackKey": None,
    }


def derive_scheduled_team_artifacts(schedule_game):
    if not isinstance(schedule_game, dict):
        return []
    game_id = str(schedule_game.get("id") or "").strip()
    date_str = str(schedule_game.get("date") or "").strip()
    start = str(schedule_game.get("starttime") or "").strip()
    if not date_str and start:
        date_str = start[:10]
    if not game_id or not date_str:
        return []
    away_abbr = str(schedule_game.get("awayteam") or "").strip().upper()
    home_abbr = str(schedule_game.get("hometeam") or "").strip().upper()
    if not away_abbr or not home_abbr:
        return []
    season = derive_season_label(date_str)
    season_type = derive_season_type(
        schedule_game,
        nba_game_id=schedule_game.get("nbaGameId"),
    )
    away_team = {
        "id": safe_int(schedule_game.get("awayTeamId")),
        "abbr": away_abbr,
        "name": "",
    }
    home_team = {
        "id": safe_int(schedule_game.get("homeTeamId")),
        "abbr": home_abbr,
        "name": "",
    }
    schedule_game = {**schedule_game, "date": date_str}
    return [
        {
            "team": away_team,
            "season": season,
            "row": build_scheduled_team_game_row(
                season=season,
                season_type=season_type,
                schedule_game=schedule_game,
                side="away",
                opponent=home_team,
            ),
        },
        {
            "team": home_team,
            "season": season,
            "row": build_scheduled_team_game_row(
                season=season,
                season_type=season_type,
                schedule_game=schedule_game,
                side="home",
                opponent=away_team,
            ),
        },
    ]


def season_key_for_player(page_prefix, player_id, season):
    return f"{page_prefix}players/{player_id}/{season}.json"


def season_key_for_team(page_prefix, team_abbr, season):
    return f"{page_prefix}teams/{team_abbr}/{season}.json"


def build_player_game_row(
    *,
    season,
    season_type,
    date_str,
    game_id,
    nba_game_id,
    start,
    gamepack_key,
    team,
    opponent,
    side,
    result,
    team_score,
    opp_score,
    player,
    box_stats,
    actions,
    segments,
    include_detail,
):
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
        "teamId": safe_int(team.get("id")),
        "teamAbbr": team.get("abbr"),
        "teamName": team.get("name"),
        "opponentId": safe_int(opponent.get("id")),
        "opponentAbbr": opponent.get("abbr"),
        "opponentName": opponent.get("name"),
        "box": box_stats,
        "gamepackKey": gamepack_key,
    }
    if include_detail:
        row["detail"] = {
            "actions": actions or [],
            "segments": segments or [],
        }
    return row


def derive_game_artifacts(
    *,
    gamepack,
    root_prefix,
    gamepack_prefix,
    page_prefix,
    identity_registry,
    include_player_detail=True,
):
    if not isinstance(gamepack, dict):
        raise ValueError("Gamepack payload must be an object.")

    box = gamepack.get("box") or {}
    teams = box.get("teams") or {}
    away_team = build_team_meta(teams.get("away"))
    home_team = build_team_meta(teams.get("home"))
    away_players = (teams.get("away") or {}).get("players") or []
    home_players = (teams.get("home") or {}).get("players") or []
    flow = gamepack.get("flow") or {}
    away_player_map = ((flow.get("players") or {}).get("away") or {}) if isinstance(flow, dict) else {}
    home_player_map = ((flow.get("players") or {}).get("home") or {}) if isinstance(flow, dict) else {}
    away_segments_map = ((flow.get("segments") or {}).get("away") or {}) if isinstance(flow, dict) else {}
    home_segments_map = ((flow.get("segments") or {}).get("home") or {}) if isinstance(flow, dict) else {}

    game_id = str(gamepack.get("publicId") or "").strip()
    nba_game_id = str(gamepack.get("id") or gamepack.get("nbaGameId") or "").strip()
    start = str(box.get("start") or "").strip() or None
    date_str = extract_date_from_game_key(game_id) or (start[:10] if start and len(start) >= 10 else "")
    if not date_str:
        raise ValueError(f"Could not determine game date for {game_id or nba_game_id}.")
    season = derive_season_label(date_str)
    season_type = derive_season_type(gamepack, box, nba_game_id=nba_game_id)
    gamepack_key = f"{root_prefix}{gamepack_prefix}{game_id}.json.gz"

    last = flow.get("last") or {}
    away_score = safe_int(last.get("awayScore"))
    home_score = safe_int(last.get("homeScore"))
    if away_score == 0 and home_score == 0:
        away_score = aggregate_team_player_stats(away_players).get("pts", 0)
        home_score = aggregate_team_player_stats(home_players).get("pts", 0)

    team_rows = [
        {
            "team": away_team,
            "season": season,
            "row": build_team_game_row(
                season=season,
                season_type=season_type,
                game_id=game_id,
                nba_game_id=nba_game_id,
                start=start,
                date_str=date_str,
                side="away",
                team=away_team,
                opponent=home_team,
                team_players=away_players,
                team_score=away_score,
                opp_score=home_score,
                gamepack_key=gamepack_key,
            ),
        },
        {
            "team": home_team,
            "season": season,
            "row": build_team_game_row(
                season=season,
                season_type=season_type,
                game_id=game_id,
                nba_game_id=nba_game_id,
                start=start,
                date_str=date_str,
                side="home",
                team=home_team,
                opponent=away_team,
                team_players=home_players,
                team_score=home_score,
                opp_score=away_score,
                gamepack_key=gamepack_key,
            ),
        },
    ]

    player_rows = []

    def append_player_rows(team, opponent, side, team_score, opp_score, team_players, player_map, segments_map):
        result = "W" if team_score > opp_score else "L" if team_score < opp_score else "T"
        for player in team_players or []:
            identity = resolve_player_identity(player, team.get("abbr"), identity_registry)
            flow_key = resolve_player_flow_key(player, player_map)
            actions = list(player_map.get(flow_key) or []) if flow_key else []
            segments = list(segments_map.get(flow_key) or []) if flow_key else []
            box_stats = build_player_box_stats(player)
            pbp_summary = summarize_player_pbp(actions, segments)
            if not player_has_output(box_stats, pbp_summary):
                continue
            season_key = season_key_for_player(page_prefix, identity["key"], season)
            row = build_player_game_row(
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
                include_detail=include_player_detail,
            )
            row["playerId"] = identity["id"]
            row["playerKey"] = identity["key"]
            player_rows.append(
                {
                    "player": {
                        "id": identity["id"],
                        "key": identity["key"],
                        "first": str(player.get("first") or "").strip(),
                        "last": str(player.get("last") or "").strip(),
                        "name": identity["name"],
                    },
                    "team": team,
                    "season": season,
                    "seasonKey": season_key,
                    "row": row,
                }
            )

    append_player_rows(
        away_team,
        home_team,
        "away",
        away_score,
        home_score,
        away_players,
        away_player_map,
        away_segments_map,
    )
    append_player_rows(
        home_team,
        away_team,
        "home",
        home_score,
        away_score,
        home_players,
        home_player_map,
        home_segments_map,
    )

    return {
        "gameId": game_id,
        "date": date_str,
        "season": season,
        "seasonType": season_type,
        "teams": team_rows,
        "players": player_rows,
    }


def init_team_artifact(team, season):
    return {
        "schemaVersion": 1,
        "updatedAt": iso_utc_now(),
        "season": season,
        "team": {
            "id": safe_int(team.get("id")),
            "abbr": team.get("abbr"),
            "name": team.get("name"),
        },
        "games": [],
        "players": [],
        "record": {"wins": 0, "losses": 0, "ties": 0},
        "totals": {},
        "averages": {},
        "bySeasonType": {},
    }


def init_player_artifact(player, season):
    return {
        "schemaVersion": 1,
        "updatedAt": iso_utc_now(),
        "season": season,
        "player": {
            "id": safe_int(player.get("id")) or None,
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


def upsert_game_row(games, row):
    row = dict(row)
    game_id = row.get("gameId")
    replaced = False
    updated = []
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


def average_numeric_fields(totals, games_played, exclude=None):
    exclude = set(exclude or [])
    averages = {}
    divisor = games_played if games_played > 0 else 1
    for key, value in (totals or {}).items():
        if key in exclude:
            continue
        averages[key] = round(safe_int(value) / divisor, 2)
    return averages


def season_type_sort_key(item):
    season_type = item[0] if isinstance(item, tuple) else item
    try:
        return (0, CANONICAL_SEASON_TYPES.index(season_type))
    except ValueError:
        return (1, str(season_type))


def game_season_type(game):
    return derive_season_type(game, nba_game_id=(game or {}).get("nbaGameId"))


def is_played_team_game(game):
    return not (isinstance(game, dict) and game.get("played") is False)


def new_team_split_bucket():
    return {
        "games": 0,
        "wins": 0,
        "losses": 0,
        "ties": 0,
        "totals": Counter(),
        "players": {},
    }


def accumulate_team_player(players, player):
    player_id = safe_int(player.get("playerId")) or None
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
        entry["box"][key] += safe_int(value)


def team_players_summary(players):
    season_players = []
    for entry in players.values():
        box_totals = dict(entry["box"])
        if "seconds" in box_totals:
            box_totals["min"] = seconds_to_clock(box_totals["seconds"])
        averages = average_numeric_fields(box_totals, entry["games"], exclude={"seconds"})
        if "seconds" in box_totals and entry["games"]:
            averages["min"] = seconds_to_clock(
                safe_int(round(box_totals["seconds"] / entry["games"]))
            )
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
            -safe_int((item.get("box") or {}).get("pts")),
            -(item.get("games") or 0),
            item.get("name") or "",
        )
    )
    return season_players


def finalize_team_split(bucket):
    totals_dict = dict(bucket["totals"])
    if "seconds" in totals_dict:
        totals_dict["min"] = seconds_to_clock(totals_dict["seconds"])
    averages = average_numeric_fields(totals_dict, bucket["games"], exclude={"seconds"})
    if "seconds" in totals_dict and bucket["games"]:
        averages["min"] = seconds_to_clock(
            safe_int(round(totals_dict["seconds"] / bucket["games"]))
        )
    return {
        "games": bucket["games"],
        "record": {"wins": bucket["wins"], "losses": bucket["losses"], "ties": bucket["ties"]},
        "totals": totals_dict,
        "averages": averages,
        "players": team_players_summary(bucket["players"]),
    }


def new_player_split_bucket():
    return {
        "games": 0,
        "wins": 0,
        "losses": 0,
        "ties": 0,
        "box": Counter(),
        "teams": {},
    }


def finalize_player_split(bucket):
    box_totals = dict(bucket["box"])
    if "seconds" in box_totals:
        box_totals["min"] = seconds_to_clock(box_totals["seconds"])
    averages_box = average_numeric_fields(dict(bucket["box"]), bucket["games"], exclude={"seconds"})
    if "seconds" in bucket["box"] and bucket["games"]:
        averages_box["min"] = seconds_to_clock(
            safe_int(round(bucket["box"]["seconds"] / bucket["games"]))
        )
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


def recalc_team_artifact(artifact):
    games = list(artifact.get("games") or [])
    totals = Counter()
    players = {}
    by_season_type = {}
    wins = losses = ties = 0
    running_wins = running_losses = running_ties = 0
    for game in games:
        season_type = game_season_type(game)
        game["seasonType"] = season_type
        if not is_played_team_game(game):
            game["recordAfter"] = {
                "wins": running_wins,
                "losses": running_losses,
                "ties": running_ties,
            }
            game["recordAfterBySeasonType"] = None
            continue
        split = by_season_type.setdefault(season_type, new_team_split_bucket())
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
        game["recordAfter"] = {
            "wins": running_wins,
            "losses": running_losses,
            "ties": running_ties,
        }
        game["recordAfterBySeasonType"] = {
            "wins": split["wins"],
            "losses": split["losses"],
            "ties": split["ties"],
        }
        totals["pointsFor"] += safe_int(game.get("teamScore"))
        totals["pointsAgainst"] += safe_int(game.get("oppScore"))
        split["totals"]["pointsFor"] += safe_int(game.get("teamScore"))
        split["totals"]["pointsAgainst"] += safe_int(game.get("oppScore"))
        for key, value in ((game.get("teamStats") or {}).items()):
            totals[key] += safe_int(value)
            split["totals"][key] += safe_int(value)
        for player in game.get("players") or []:
            accumulate_team_player(players, player)
            accumulate_team_player(split["players"], player)

    artifact["games"] = games
    artifact["players"] = team_players_summary(players)
    artifact["record"] = {"wins": wins, "losses": losses, "ties": ties}
    totals_dict = dict(totals)
    if "seconds" in totals_dict:
        totals_dict["min"] = seconds_to_clock(totals_dict["seconds"])
    artifact["totals"] = totals_dict
    artifact["averages"] = average_numeric_fields(
        totals_dict,
        wins + losses + ties,
        exclude={"seconds"},
    )
    if "seconds" in totals_dict and wins + losses + ties:
        artifact["averages"]["min"] = seconds_to_clock(
            safe_int(round(totals_dict["seconds"] / (wins + losses + ties)))
        )
    artifact["bySeasonType"] = {
        season_type: finalize_team_split(bucket)
        for season_type, bucket in sorted(by_season_type.items(), key=season_type_sort_key)
    }
    artifact["updatedAt"] = iso_utc_now()
    return artifact


def recalc_player_artifact(artifact):
    games = list(artifact.get("games") or [])
    totals_box = Counter()
    wins = losses = ties = 0
    teams = {}
    by_season_type = {}
    for game in games:
        season_type = game_season_type(game)
        game["seasonType"] = season_type
        split = by_season_type.setdefault(season_type, new_player_split_bucket())
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

        team_id = safe_int(game.get("teamId"))
        team_abbr = str(game.get("teamAbbr") or "").strip().upper()
        team_name = str(game.get("teamName") or "").strip()
        if team_id > 0 or team_abbr or team_name:
            teams[(team_id, team_abbr)] = {
                "id": team_id,
                "abbr": team_abbr,
                "name": team_name,
            }
            split["teams"][(team_id, team_abbr)] = {
                "id": team_id,
                "abbr": team_abbr,
                "name": team_name,
            }

        for key, value in ((game.get("box") or {}).items()):
            if key == "min":
                continue
            totals_box[key] += safe_int(value)
            split["box"][key] += safe_int(value)

    games_played = len(games)
    totals = {
        "games": games_played,
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "box": dict(totals_box),
    }
    if "seconds" in totals["box"]:
        totals["box"]["min"] = seconds_to_clock(totals["box"]["seconds"])
    averages = {
        "box": average_numeric_fields(dict(totals_box), games_played, exclude={"seconds"}),
    }
    if "seconds" in totals_box and games_played:
        averages["box"]["min"] = seconds_to_clock(
            safe_int(round(totals_box["seconds"] / games_played))
        )

    artifact["games"] = games
    artifact["teams"] = sorted(teams.values(), key=lambda item: (item["abbr"], item["id"]))
    artifact["record"] = {"wins": wins, "losses": losses, "ties": ties}
    artifact["totals"] = totals
    artifact["averages"] = averages
    artifact["bySeasonType"] = {
        season_type: finalize_player_split(bucket)
        for season_type, bucket in sorted(by_season_type.items(), key=season_type_sort_key)
    }
    artifact["updatedAt"] = iso_utc_now()
    return artifact


def collect_date_targets(args, s3_client, schedule_prefix, *, include_game_key_dates=False):
    if args.date:
        date_targets = [args.date]
    elif args.start_date and args.end_date:
        date_targets = expand_date_range(args.start_date, args.end_date)
    elif args.all_s3:
        date_targets = list_schedule_dates_from_s3(s3_client, args.bucket, schedule_prefix)
    else:
        date_targets = []

    if include_game_key_dates:
        for game_key in args.game_key or []:
            game_date = extract_date_from_game_key(str(game_key or "").strip())
            if game_date:
                date_targets.append(game_date)

    deduped = []
    seen = set()
    for date_str in date_targets:
        if date_str in seen:
            continue
        seen.add(date_str)
        deduped.append(date_str)

    if args.max_dates is not None:
        deduped = deduped[: max(0, args.max_dates)]
    return deduped


def collect_targets(args, s3_client, schedule_prefix):
    game_targets = []
    schedule_cache = {}

    def get_schedule(date_str):
        if date_str not in schedule_cache:
            schedule_cache[date_str] = load_schedule_from_s3(
                s3_client,
                args.bucket,
                date_str,
                schedule_prefix,
            )
        return schedule_cache[date_str]

    def add_date(date_str):
        schedule = get_schedule(date_str)
        if not schedule:
            print(f"Skip {date_str}: missing schedule file.")
            return
        for item in schedule:
            if not isinstance(item, dict):
                continue
            game_id = str(item.get("id") or "").strip()
            if not game_id:
                continue
            if not args.include_non_final and not is_final_schedule_game(item):
                continue
            game_targets.append(
                {
                    "gameKey": game_id,
                    "date": date_str,
                    "scheduleGame": item,
                }
            )

    seen = set()
    for game_key in args.game_key or []:
        normalized = str(game_key or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        game_date = extract_date_from_game_key(normalized)
        schedule_game = None
        if game_date:
            schedule = get_schedule(game_date)
            schedule_game = next((item for item in schedule if str(item.get("id")) == normalized), None)
            if schedule_game and not args.include_non_final and not is_final_schedule_game(schedule_game):
                print(f"Skip {normalized}: schedule status is not final.")
                continue
        game_targets.append({"gameKey": normalized, "date": game_date, "scheduleGame": schedule_game})

    for date_str in collect_date_targets(args, s3_client, schedule_prefix):
        add_date(date_str)

    deduped = []
    seen = set()
    for target in game_targets:
        game_key = target["gameKey"]
        if game_key in seen:
            continue
        seen.add(game_key)
        deduped.append(target)
    return deduped


def collect_future_team_items(args, s3_client, schedule_prefix, *, now=None):
    items = []
    seen = set()
    for date_str in collect_date_targets(args, s3_client, schedule_prefix, include_game_key_dates=True):
        for schedule_game in load_schedule_from_s3(s3_client, args.bucket, date_str, schedule_prefix):
            game_id = str((schedule_game or {}).get("id") or "").strip()
            if not game_id or game_id in seen:
                continue
            if not is_future_schedule_game(schedule_game, now=now):
                continue
            seen.add(game_id)
            items.extend(derive_scheduled_team_artifacts(schedule_game))
    return items


def load_or_init_team_artifact(cache, *, s3_client, bucket, root_prefix, page_prefix, team, season):
    key = season_key_for_team(page_prefix, team.get("abbr"), season)
    if key in cache:
        return key, cache[key]
    existing = load_json_from_s3(
        s3_client=s3_client,
        bucket=bucket,
        key=f"{root_prefix}{key}.gz",
        allow_missing=True,
    )
    artifact = existing if isinstance(existing, dict) else init_team_artifact(team, season)
    cache[key] = artifact
    return key, artifact


def load_or_init_player_artifact(cache, *, s3_client, bucket, root_prefix, season_key, player, season):
    if season_key in cache:
        return season_key, cache[season_key]
    existing = load_json_from_s3(
        s3_client=s3_client,
        bucket=bucket,
        key=f"{root_prefix}{season_key}.gz",
        allow_missing=True,
    )
    artifact = existing if isinstance(existing, dict) else init_player_artifact(player, season)
    cache[season_key] = artifact
    return season_key, artifact


def main():
    args = parse_args()
    args.prefix = ensure_trailing_slash(args.prefix)
    args.gamepack_prefix = ensure_trailing_slash(args.gamepack_prefix)
    args.page_prefix = ensure_trailing_slash(args.page_prefix)
    args.schedule_prefix = ensure_trailing_slash(args.schedule_prefix)

    s3_client = boto3.client("s3", region_name=args.region)
    targets = collect_targets(args, s3_client, args.schedule_prefix)
    future_team_items = collect_future_team_items(args, s3_client, args.schedule_prefix)
    if not targets and not future_team_items:
        print("No game targets to process.")
        return 0

    print(f"Processing {len(targets)} finalized game(s).")
    team_cache = {}
    player_cache = {}
    loaded_gamepacks = {}
    processed_games = 0
    skipped_games = 0

    for index, target in enumerate(targets, start=1):
        game_key = target["gameKey"]
        print(f"[{index}/{len(targets)}] {game_key}")
        gamepack_key = f"{args.prefix}{args.gamepack_prefix}{game_key}.json.gz"
        gamepack = load_json_from_s3(
            s3_client=s3_client,
            bucket=args.bucket,
            key=gamepack_key,
            allow_missing=True,
        )
        if not isinstance(gamepack, dict):
            print(f"Skip {game_key}: missing gamepack at {gamepack_key}")
            skipped_games += 1
            continue
        loaded_gamepacks[game_key] = gamepack

    identity_registry = build_identity_registry(loaded_gamepacks.values())

    for game_key, gamepack in loaded_gamepacks.items():
        derived = derive_game_artifacts(
            gamepack=gamepack,
            root_prefix=args.prefix,
            gamepack_prefix=args.gamepack_prefix,
            page_prefix=args.page_prefix,
            identity_registry=identity_registry,
            include_player_detail=not args.summary_only,
        )
        for item in derived["teams"]:
            team = item["team"]
            season = item["season"]
            _, artifact = load_or_init_team_artifact(
                team_cache,
                s3_client=s3_client,
                bucket=args.bucket,
                root_prefix=args.prefix,
                page_prefix=args.page_prefix,
                team=team,
                season=season,
            )
            artifact["games"] = upsert_game_row(artifact.get("games"), item["row"])
            recalc_team_artifact(artifact)

        if not args.teams_only:
            for item in derived["players"]:
                _, artifact = load_or_init_player_artifact(
                    player_cache,
                    s3_client=s3_client,
                    bucket=args.bucket,
                    root_prefix=args.prefix,
                    season_key=item["seasonKey"],
                    player=item["player"],
                    season=item["season"],
                )
                artifact["games"] = upsert_game_row(artifact.get("games"), item["row"])
                recalc_player_artifact(artifact)

        processed_games += 1

    for item in future_team_items:
        team = item["team"]
        season = item["season"]
        _, artifact = load_or_init_team_artifact(
            team_cache,
            s3_client=s3_client,
            bucket=args.bucket,
            root_prefix=args.prefix,
            page_prefix=args.page_prefix,
            team=team,
            season=season,
        )
        artifact["games"] = upsert_game_row(artifact.get("games"), item["row"])
        recalc_team_artifact(artifact)

    if args.dry_run:
        print(
            f"DRY RUN: would write {len(team_cache)} team season files, "
            f"and {len(player_cache)} player season files."
        )
        return 0

    for key, artifact in sorted(team_cache.items()):
        upload_json_to_s3(
            s3_client=s3_client,
            bucket=args.bucket,
            prefix=args.prefix,
            key=key,
            data=artifact,
            is_final=False,
        )

    for key, artifact in sorted(player_cache.items()):
        upload_json_to_s3(
            s3_client=s3_client,
            bucket=args.bucket,
            prefix=args.prefix,
            key=key,
            data=artifact,
            is_final=False,
        )

    print(
        f"Done. Processed {processed_games} game(s), skipped {skipped_games}, "
        f"wrote {len(team_cache)} team files and {len(player_cache)} player files."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
