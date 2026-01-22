import argparse
import gzip
import json
import os
import sys
import time
import re
from datetime import datetime, timedelta

import boto3
from botocore.exceptions import ClientError

ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, "functions", "nba-game-poller"))

from nba_game_poller.nba_api import fetch_nba_data_urllib  # noqa: E402
from nba_game_poller.playbyplay_processing import process_playbyplay_payload  # noqa: E402
from nba_game_poller.storage import upload_json_to_s3  # noqa: E402

SCHEDULE_FEED_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backfill combined gamepack payloads for a given NBA date."
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
        help="Backfill every date that has a schedule file in S3.",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("DATA_BUCKET", "roryeagan.com-nba-processed-data"),
        help="S3 bucket for data uploads",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", "us-east-1"),
        help="AWS region",
    )
    parser.add_argument(
        "--prefix",
        default="data/",
        help="S3 prefix for data uploads",
    )
    parser.add_argument(
        "--schedule-prefix",
        default="schedule/",
        help="S3 prefix for schedule files",
    )
    parser.add_argument(
        "--game-id-map-prefix",
        default="private/gameIdMap/",
        help="S3 prefix for game id map files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be uploaded without writing to S3",
    )
    parser.add_argument(
        "--use-feed",
        action="store_true",
        help="Force using the NBA schedule feed instead of S3 schedule files",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=1.0,
        help="Delay between each game (default: 1.0s).",
    )
    parser.add_argument(
        "--sleep-date-seconds",
        type=float,
        default=2.0,
        help="Delay between each date (default: 2.0s).",
    )
    parser.add_argument(
        "--skip-future",
        action="store_true",
        help="Skip dates later than today.",
    )
    parser.add_argument(
        "--max-dates",
        type=int,
        default=None,
        help="Limit number of dates processed.",
    )
    return parser.parse_args()


def gunzip_payload(payload):
    if payload.startswith(b"\x1f\x8b"):
        return gzip.decompress(payload)
    return payload


def load_schedule_from_s3(s3_client, bucket, date_str, prefix):
    key = f"{prefix}{date_str}.json.gz"
    try:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404", "NotFound"):
            return []
        raise
    payload = resp["Body"].read()
    payload = gunzip_payload(payload)
    data = json.loads(payload.decode("utf-8"))
    return data if isinstance(data, list) else []


def parse_feed_date(value):
    if not value:
        return None
    for fmt in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_feed_starttime(game, game_date_str):
    for key in ("gameDateTimeEst", "gameDateEst"):
        raw = game.get(key)
        if raw:
            try:
                return datetime.fromisoformat(raw.replace("Z", "")).strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                continue
    for key in ("gameDateTimeUTC", "gameDateUTC", "gameTimeUTC"):
        raw = game.get(key)
        if raw:
            try:
                parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                return parsed.astimezone().strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                continue
    if game_date_str:
        return f"{game_date_str}T00:00:00"
    return None


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
    if not start or not end:
        return []
    if end < start:
        return []
    days = (end - start).days
    return [(start + timedelta(days=offset)).strftime("%Y-%m-%d") for offset in range(days + 1)]


def list_schedule_dates_from_s3(s3_client, bucket, prefix):
    date_re = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    dates = []
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for entry in page.get("Contents", []) or []:
            key = entry.get("Key") or ""
            if not key.startswith(prefix):
                continue
            name = key[len(prefix):]
            if not name.endswith(".json.gz"):
                continue
            date_part = name[:-len(".json.gz")]
            if date_re.match(date_part):
                dates.append(date_part)
    return sorted(set(dates))


def normalize_team_slug(value):
    if not value:
        return None
    return "".join(ch for ch in str(value).strip().lower() if ch.isalnum()) or None


def build_game_slug(date_str, away_team, home_team, fallback_id=None):
    away = normalize_team_slug(away_team)
    home = normalize_team_slug(home_team)
    if date_str and away and home:
        return f"{date_str}-{away}-{home}"
    if fallback_id is not None:
        return str(fallback_id)
    return None


def trim_clock_value(clock):
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


def coerce_nba_game_id(value):
    if value is None:
        return None
    raw = str(value).strip()
    return raw if raw.isdigit() else None


def build_feed_schedule(date_str):
    data, _ = fetch_nba_data_urllib(SCHEDULE_FEED_URL)
    league = data.get("leagueSchedule", {}) if isinstance(data, dict) else {}
    game_dates = league.get("gameDates", []) if isinstance(league, dict) else []
    schedule = []
    for game_date in game_dates:
        game_date_str = parse_feed_date(game_date.get("gameDate"))
        if game_date_str != date_str:
            continue
        for game in game_date.get("games", []) or []:
            game_id = game.get("gameId")
            if not game_id:
                continue
            home = game.get("homeTeam") or {}
            away = game.get("awayTeam") or {}
            away_tricode = away.get("teamTricode")
            home_tricode = home.get("teamTricode")
            game_key = build_game_slug(game_date_str, away_tricode, home_tricode, fallback_id=game_id)
            schedule.append({
                "id": game_key,
                "nbaGameId": str(game_id),
                "date": game_date_str,
                "starttime": parse_feed_starttime(game, game_date_str),
                "hometeam": home_tricode,
                "awayteam": away_tricode,
                "homescore": home.get("score") or 0,
                "awayscore": away.get("score") or 0,
                "status": (game.get("gameStatusText") or "").strip() or ("Scheduled" if game.get("gameStatus") == 1 else ""),
                "time": trim_clock_value(game.get("gameClock", "") or ""),
                "homerecord": f"{home.get('wins') or 0}-{home.get('losses') or 0}",
                "awayrecord": f"{away.get('wins') or 0}-{away.get('losses') or 0}",
            })
    return schedule


def build_schedule_payload(schedule, date_str):
    updated = []
    for item in schedule:
        if not isinstance(item, dict):
            continue
        item_date = item.get("date") or date_str
        away_team = item.get("awayteam")
        home_team = item.get("hometeam")
        game_key = build_game_slug(item_date, away_team, home_team, fallback_id=item.get("id"))
        next_item = {**item, "id": game_key, "date": item_date}
        if "time" not in next_item and next_item.get("clock"):
            next_item["time"] = trim_clock_value(next_item.get("clock"))
        next_item.pop("clock", None)
        next_item.pop("nbaGameId", None)
        updated.append(next_item)
    return updated


def upload_schedule_to_s3(s3_client, bucket, date_str, prefix, schedule):
    payload = json.dumps(schedule).encode("utf-8")
    compressed = gzip.compress(payload)
    key = f"{prefix}{date_str}.json.gz"
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=compressed,
        ContentType="application/json",
        ContentEncoding="gzip",
        CacheControl="s-maxage=0, max-age=0, must-revalidate",
    )
    print(f"Uploaded schedule -> {key} ({len(schedule)} games)")


def load_game_id_map_from_s3(s3_client, bucket, date_str, prefix):
    key = f"{prefix}{date_str}.json"
    try:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404", "NotFound"):
            return None
        raise
    payload = resp["Body"].read()
    data = json.loads(payload.decode("utf-8"))
    return data if isinstance(data, dict) else None


def upload_game_id_map_to_s3(s3_client, bucket, date_str, prefix, mapping):
    payload = json.dumps(mapping).encode("utf-8")
    key = f"{prefix}{date_str}.json"
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=payload,
        ContentType="application/json",
        CacheControl="s-maxage=0, max-age=0, must-revalidate",
    )
    print(f"Uploaded gameId map -> {key} ({len(mapping)} games)")


def build_game_id_map_from_schedule(schedule, date_str):
    mapping = {}
    for item in schedule or []:
        if not isinstance(item, dict):
            continue
        item_date = item.get("date") or date_str
        away_team = item.get("awayteam")
        home_team = item.get("hometeam")
        nba_game_id = (
            coerce_nba_game_id(item.get("nbaGameId"))
            or coerce_nba_game_id(item.get("id"))
        )
        if not nba_game_id:
            continue
        game_key = build_game_slug(item_date, away_team, home_team, fallback_id=nba_game_id)
        if not game_key:
            continue
        mapping[str(game_key)] = str(nba_game_id)
    return mapping


def load_games_from_feed(date_str):
    data, _ = fetch_nba_data_urllib(SCHEDULE_FEED_URL)
    league = data.get("leagueSchedule", {}) if isinstance(data, dict) else {}
    game_dates = league.get("gameDates", []) if isinstance(league, dict) else []
    games = []
    for game_date in game_dates:
        game_date_str = parse_feed_date(game_date.get("gameDate"))
        if game_date_str != date_str:
            continue
        for game in game_date.get("games", []) or []:
            game_id = game.get("gameId")
            if game_id:
                away = (game.get("awayTeam") or {}).get("teamTricode")
                home = (game.get("homeTeam") or {}).get("teamTricode")
                game_key = build_game_slug(game_date_str, away, home, fallback_id=game_id)
                games.append({"id": game_key, "nbaGameId": str(game_id)})
    return games


def build_box_payload(game_id, box_game):
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


def build_team_payload(team):
    if not isinstance(team, dict):
        return None
    players = []
    for player in team.get("players") or []:
        if not isinstance(player, dict):
            continue
        person_id = player.get("personId")
        if person_id is None:
            continue
        stats = player.get("statistics") or {}
        players.append(
            {
                "id": person_id,
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


def backfill_gamepack_for_game(game_key, nba_game_id, s3_client, bucket, prefix, dry_run=False):
    play_url = f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{nba_game_id}.json"
    box_url = f"https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{nba_game_id}.json"
    play_data, _ = fetch_nba_data_urllib(play_url)
    box_data, _ = fetch_nba_data_urllib(box_url)

    if not play_data or not box_data:
        print(f"Skip {game_key}: missing play or box data.")
        return False

    actions = play_data.get("game", {}).get("actions", [])
    box_game = box_data.get("game", {})
    if not actions or not box_game:
        print(f"Skip {game_key}: empty actions or box payload.")
        return False

    home_team_id = (
        box_game.get("homeTeam", {}).get("teamId") or box_game.get("homeTeamId")
    )
    away_team_id = (
        box_game.get("awayTeam", {}).get("teamId") or box_game.get("awayTeamId")
    )
    play_game = play_data.get("game", {})
    home_team_id = home_team_id or play_game.get("homeTeamId") or play_game.get("homeTeam", {}).get("teamId")
    away_team_id = away_team_id or play_game.get("awayTeamId") or play_game.get("awayTeam", {}).get("teamId")

    processed = process_playbyplay_payload(
        game_id=str(nba_game_id),
        actions=actions,
        away_team_id=away_team_id,
        home_team_id=home_team_id,
        include_actions=False,
        include_all_actions=False,
    )
    slim_box = build_box_payload(str(nba_game_id), box_game)

    last_desc = (actions[-1].get("description") or "").strip() if actions else ""
    is_play_final = last_desc.startswith("Game End")
    status_text = (box_game.get("gameStatusText") or "").strip()
    is_box_final = status_text.startswith("Final")

    gamepack = {
        "v": 1,
        "id": str(nba_game_id),
        "publicId": str(game_key),
        "box": slim_box,
        "flow": processed,
    }

    if dry_run:
        print(f"DRY RUN: would upload gamepack for {game_key}")
        return True

    upload_json_to_s3(
        s3_client=s3_client,
        bucket=bucket,
        prefix=prefix,
        key=f"gamepack/{game_key}.json",
        data=gamepack,
        is_final=is_play_final or is_box_final,
    )
    return True


def main():
    args = parse_args()
    s3_client = boto3.client("s3", region_name=args.region)
    if args.game_id_map_prefix and not args.game_id_map_prefix.endswith("/"):
        args.game_id_map_prefix += "/"
    if args.schedule_prefix and not args.schedule_prefix.endswith("/"):
        args.schedule_prefix += "/"

    date_list = []
    if args.date:
        date_list = [args.date]
    elif args.start_date and args.end_date:
        date_list = expand_date_range(args.start_date, args.end_date)
    elif args.all_s3:
        date_list = list_schedule_dates_from_s3(
            s3_client, args.bucket, args.schedule_prefix
        )

    if not date_list:
        print("No dates to process. Provide --date, --start-date/--end-date, or --all-s3.")
        return

    if args.skip_future:
        today = datetime.utcnow().date()
        date_list = [d for d in date_list if parse_date(d) and parse_date(d) <= today]

    if args.max_dates is not None:
        date_list = date_list[: max(0, args.max_dates)]

    total_dates = len(date_list)
    print(f"Processing {total_dates} date(s).")

    for index, date_str in enumerate(date_list, start=1):
        print(f"\n[{index}/{total_dates}] Backfill for {date_str}")
        run_for_date(args, s3_client, date_str)
        if args.sleep_date_seconds and index < total_dates:
            time.sleep(args.sleep_date_seconds)


def run_for_date(args, s3_client, date_str):
    if args.use_feed:
        schedule = build_feed_schedule(date_str)
    else:
        schedule = load_schedule_from_s3(
            s3_client, args.bucket, date_str, args.schedule_prefix
        )
        if not schedule:
            print("Schedule file missing or empty; falling back to NBA schedule feed.")
            schedule = build_feed_schedule(date_str)

    schedule_map = build_game_id_map_from_schedule(schedule, date_str)
    schedule = build_schedule_payload(schedule, date_str) if schedule else []
    if schedule:
        upload_schedule_to_s3(
            s3_client,
            args.bucket,
            date_str,
            args.schedule_prefix,
            schedule,
        )

    game_id_map = load_game_id_map_from_s3(
        s3_client,
        args.bucket,
        date_str,
        args.game_id_map_prefix,
    )
    if not game_id_map and schedule_map:
        game_id_map = schedule_map
        upload_game_id_map_to_s3(
            s3_client,
            args.bucket,
            date_str,
            args.game_id_map_prefix,
            game_id_map,
        )
    if not game_id_map:
        feed_games = load_games_from_feed(date_str)
        game_id_map = {entry["id"]: entry["nbaGameId"] for entry in feed_games}
        if game_id_map:
            upload_game_id_map_to_s3(
                s3_client,
                args.bucket,
                date_str,
                args.game_id_map_prefix,
                game_id_map,
            )

    games = []
    for game in schedule:
        game_id = game.get("id")
        if not game_id:
            continue
        nba_game_id = coerce_nba_game_id(game_id_map.get(str(game_id)) if game_id_map else None)
        if not nba_game_id:
            print(f"Skipping {game_id}: missing numeric nbaGameId in map.")
            continue
        games.append({"id": str(game_id), "nbaGameId": str(nba_game_id)})

    if not games:
        print(f"No games found for {date_str}.")
        return

    print(f"Backfilling {len(games)} games for {date_str}...")
    success = 0
    for game in games:
        if backfill_gamepack_for_game(
            game_key=game["id"],
            nba_game_id=game["nbaGameId"],
            s3_client=s3_client,
            bucket=args.bucket,
            prefix=args.prefix,
            dry_run=args.dry_run,
        ):
            success += 1
        if args.sleep_seconds:
            time.sleep(args.sleep_seconds)
    print(f"Done. Uploaded {success}/{len(games)} gamepacks for {date_str}.")


if __name__ == "__main__":
    main()
