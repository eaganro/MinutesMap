import argparse
import gzip
import json
import os
import sys
from datetime import datetime

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
        default="2026-01-19",
        help="NBA date in YYYY-MM-DD (default: 2026-01-19)",
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
        "--dry-run",
        action="store_true",
        help="Print what would be uploaded without writing to S3",
    )
    parser.add_argument(
        "--use-feed",
        action="store_true",
        help="Force using the NBA schedule feed instead of S3 schedule files",
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


def load_game_ids_from_feed(date_str):
    data, _ = fetch_nba_data_urllib(SCHEDULE_FEED_URL)
    league = data.get("leagueSchedule", {}) if isinstance(data, dict) else {}
    game_dates = league.get("gameDates", []) if isinstance(league, dict) else []
    game_ids = []
    for game_date in game_dates:
        game_date_str = parse_feed_date(game_date.get("gameDate"))
        if game_date_str != date_str:
            continue
        for game in game_date.get("games", []) or []:
            game_id = game.get("gameId")
            if game_id:
                game_ids.append(str(game_id))
    return game_ids


def build_box_payload(game_id, box_game):
    if not isinstance(box_game, dict):
        return None
    return {
        "id": game_id,
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


def backfill_gamepack_for_game(game_id, s3_client, bucket, prefix, dry_run=False):
    play_url = f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{game_id}.json"
    box_url = f"https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{game_id}.json"
    play_data, _ = fetch_nba_data_urllib(play_url)
    box_data, _ = fetch_nba_data_urllib(box_url)

    if not play_data or not box_data:
        print(f"Skip {game_id}: missing play or box data.")
        return False

    actions = play_data.get("game", {}).get("actions", [])
    box_game = box_data.get("game", {})
    if not actions or not box_game:
        print(f"Skip {game_id}: empty actions or box payload.")
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
        game_id=str(game_id),
        actions=actions,
        away_team_id=away_team_id,
        home_team_id=home_team_id,
        include_actions=False,
        include_all_actions=False,
    )
    slim_box = build_box_payload(str(game_id), box_game)

    last_desc = (actions[-1].get("description") or "").strip() if actions else ""
    is_play_final = last_desc.startswith("Game End")
    status_text = (box_game.get("gameStatusText") or "").strip()
    is_box_final = status_text.startswith("Final")

    gamepack = {
        "v": 1,
        "id": str(game_id),
        "box": slim_box,
        "flow": processed,
    }

    if dry_run:
        print(f"DRY RUN: would upload gamepack for {game_id}")
        return True

    upload_json_to_s3(
        s3_client=s3_client,
        bucket=bucket,
        prefix=prefix,
        key=f"gamepack/{game_id}.json",
        data=gamepack,
        is_final=is_play_final or is_box_final,
    )
    return True


def main():
    args = parse_args()
    s3_client = boto3.client("s3", region_name=args.region)

    if args.use_feed:
        game_ids = load_game_ids_from_feed(args.date)
    else:
        schedule = load_schedule_from_s3(
            s3_client, args.bucket, args.date, args.schedule_prefix
        )
        if schedule:
            game_ids = [str(game.get("id")) for game in schedule if game.get("id")]
        else:
            print("Schedule file missing or empty; falling back to NBA schedule feed.")
            game_ids = load_game_ids_from_feed(args.date)

    if not game_ids:
        print(f"No games found for {args.date}.")
        return

    print(f"Backfilling {len(game_ids)} games for {args.date}...")
    success = 0
    for game_id in game_ids:
        if backfill_gamepack_for_game(
            game_id=game_id,
            s3_client=s3_client,
            bucket=args.bucket,
            prefix=args.prefix,
            dry_run=args.dry_run,
        ):
            success += 1
    print(f"Done. Uploaded {success}/{len(game_ids)} gamepacks.")


if __name__ == "__main__":
    main()
