import argparse
import os
import time
from datetime import date, datetime

import boto3

from backfill_gamepack import backfill_gamepack_for_game, build_game_slug, parse_feed_date
from nba_game_poller.nba_api import fetch_nba_data_urllib

SCHEDULE_FEED_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Temporary runner: backfill gamepacks for one team in one season window."
    )
    parser.add_argument(
        "--team",
        default="OKC",
        help="Team tricode filter (default: OKC).",
    )
    parser.add_argument(
        "--start-date",
        default=None,
        help="Start date YYYY-MM-DD. Defaults to current season start (Oct 1).",
    )
    parser.add_argument(
        "--end-date",
        default=None,
        help="End date YYYY-MM-DD. Defaults to current season end (Jun 30).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List matching games and what would be uploaded.",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("DATA_BUCKET", "roryeagan.com-nba-processed-data"),
        help="S3 bucket for uploads",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", "us-east-1"),
        help="AWS region",
    )
    parser.add_argument(
        "--prefix",
        default="data/",
        help="S3 prefix for uploads",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.5,
        help="Delay between games (default: 0.5s).",
    )
    parser.add_argument(
        "--max-games",
        type=int,
        default=None,
        help="Optional cap for safety/testing.",
    )
    return parser.parse_args()


def parse_date(value):
    return datetime.strptime(value, "%Y-%m-%d").date()


def default_season_window():
    today = date.today()
    season_start_year = today.year if today.month >= 10 else today.year - 1
    return (
        date(season_start_year, 10, 1),
        date(season_start_year + 1, 6, 30),
    )


def get_season_window(args):
    default_start, default_end = default_season_window()
    start = parse_date(args.start_date) if args.start_date else default_start
    end = parse_date(args.end_date) if args.end_date else default_end
    if end < start:
        raise ValueError(f"end-date {end} is before start-date {start}")
    return start, end


def collect_team_games(team_tricode, start, end):
    payload, _ = fetch_nba_data_urllib(SCHEDULE_FEED_URL)
    league = payload.get("leagueSchedule", {}) if isinstance(payload, dict) else {}
    game_dates = league.get("gameDates", []) if isinstance(league, dict) else []

    team = (team_tricode or "").strip().upper()
    games = []
    for game_date in game_dates:
        game_date_str = parse_feed_date(game_date.get("gameDate"))
        if not game_date_str:
            continue
        game_day = parse_date(game_date_str)
        if game_day < start or game_day > end:
            continue
        for game in game_date.get("games", []) or []:
            home = game.get("homeTeam") or {}
            away = game.get("awayTeam") or {}
            home_tri = (home.get("teamTricode") or "").strip().upper()
            away_tri = (away.get("teamTricode") or "").strip().upper()
            if team not in (home_tri, away_tri):
                continue
            game_id = str(game.get("gameId") or "").strip()
            if not game_id.isdigit():
                continue
            game_key = build_game_slug(
                game_date_str,
                away_tri.lower(),
                home_tri.lower(),
                fallback_id=game_id,
            )
            games.append(
                {
                    "date": game_date_str,
                    "id": game_key,
                    "nbaGameId": game_id,
                    "away": away_tri,
                    "home": home_tri,
                }
            )

    games.sort(key=lambda g: (g["date"], g["id"]))
    return games


def main():
    args = parse_args()
    start, end = get_season_window(args)
    games = collect_team_games(args.team, start, end)
    if args.max_games is not None:
        games = games[: max(0, args.max_games)]

    print(
        f"Team {args.team.upper()} games from {start.isoformat()} to {end.isoformat()}: {len(games)}"
    )
    for game in games:
        print(f"{game['date']}  {game['away']} @ {game['home']}  {game['id']}  {game['nbaGameId']}")

    if not games:
        return 0

    s3_client = boto3.client("s3", region_name=args.region)
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

    mode = "would upload" if args.dry_run else "uploaded"
    print(f"Done: {mode} {success}/{len(games)} gamepacks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
