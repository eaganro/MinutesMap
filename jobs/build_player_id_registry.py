import argparse
import gzip
import json
import os
import re
from datetime import datetime, timedelta

import boto3

from player_id_registry import (
    build_identity_registry,
    derive_season_label,
    parse_date,
    serialize_registry,
)


DEFAULT_BUCKET = os.environ.get("DATA_BUCKET", "roryeagan.com-nba-processed-data")
DEFAULT_REGION = os.environ.get("AWS_REGION", "us-east-1")
DEFAULT_PREFIX = "data/"
DEFAULT_GAMEPACK_PREFIX = "gamepack/"
DEFAULT_REGISTRY_PREFIX = "private/player-id-registry/"
GAMEPACK_KEY_RE = re.compile(r"(\d{4}-\d{2}-\d{2})-[^/]+\.json\.gz$")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build per-season player ID registry files from stored gamepacks."
    )
    parser.add_argument("--season", action="append", default=[], help="Season label like 2025-26. May be repeated.")
    parser.add_argument("--date", default=None, help="Single date YYYY-MM-DD.")
    parser.add_argument("--start-date", default=None, help="Start date YYYY-MM-DD.")
    parser.add_argument("--end-date", default=None, help="End date YYYY-MM-DD.")
    parser.add_argument(
        "--bucket",
        default=DEFAULT_BUCKET,
        help="S3 bucket for reads/writes.",
    )
    parser.add_argument(
        "--region",
        default=DEFAULT_REGION,
        help="AWS region.",
    )
    parser.add_argument(
        "--prefix",
        default=DEFAULT_PREFIX,
        help="Root processed-data prefix (default: data/).",
    )
    parser.add_argument(
        "--gamepack-prefix",
        default=DEFAULT_GAMEPACK_PREFIX,
        help="Gamepack prefix relative to --prefix (default: gamepack/).",
    )
    parser.add_argument(
        "--registry-prefix",
        default=DEFAULT_REGISTRY_PREFIX,
        help="Registry prefix relative to --prefix (default: private/player-id-registry/).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be written without uploading registry files.",
    )
    return parser.parse_args()


def ensure_trailing_slash(value):
    if not value:
        return ""
    return value if value.endswith("/") else f"{value}/"


def expand_date_range(start_date, end_date):
    start = parse_date(start_date)
    end = parse_date(end_date)
    if not start or not end or end < start:
        return []
    days = (end - start).days
    return [(start + timedelta(days=offset)).isoformat() for offset in range(days + 1)]


def parse_season_label(value):
    raw = str(value or "").strip()
    match = re.match(r"^(\d{4})-(\d{2})$", raw)
    if not match:
        return None
    start_year = int(match.group(1))
    end_year = int(match.group(2))
    if end_year != (start_year + 1) % 100:
        return None
    return raw


def season_window(season):
    parsed = parse_season_label(season)
    if not parsed:
        return None
    start_year = int(parsed[:4])
    return (datetime(start_year, 10, 1).date(), datetime(start_year + 1, 6, 30).date())


def extract_date_from_key(key):
    match = GAMEPACK_KEY_RE.search(key or "")
    return match.group(1) if match else None


def gunzip_payload(payload):
    if payload.startswith(b"\x1f\x8b"):
        return gzip.decompress(payload)
    return payload


def list_gamepack_keys_for_window(s3_client, bucket, prefix, start_date, end_date):
    years = sorted({start_date.year, end_date.year})
    keys = []
    seen = set()
    for year in years:
        year_prefix = f"{prefix}{year}-"
        paginator = s3_client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=year_prefix):
            for entry in page.get("Contents", []) or []:
                key = entry.get("Key") or ""
                key_date = parse_date(extract_date_from_key(key))
                if not key_date or key_date < start_date or key_date > end_date:
                    continue
                if key in seen:
                    continue
                seen.add(key)
                keys.append(key)
    return sorted(keys)


def load_gamepacks(s3_client, bucket, keys):
    gamepacks = []
    for key in keys:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
        payload = resp["Body"].read()
        payload = gunzip_payload(payload)
        data = json.loads(payload.decode("utf-8"))
        if isinstance(data, dict):
            gamepacks.append(data)
    return gamepacks


def write_registry(s3_client, bucket, key, payload):
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=gzip.compress(json.dumps(payload).encode("utf-8")),
        ContentType="application/json",
        ContentEncoding="gzip",
        CacheControl="public, max-age=604800",
    )


def resolve_requested_seasons(args):
    seasons = {parse_season_label(item) for item in (args.season or []) if parse_season_label(item)}
    if args.date:
        season = derive_season_label(args.date)
        if season:
            seasons.add(season)
    elif args.start_date and args.end_date:
        for date_str in expand_date_range(args.start_date, args.end_date):
            season = derive_season_label(date_str)
            if season:
                seasons.add(season)
    return sorted(seasons)


def main():
    args = parse_args()
    args.prefix = ensure_trailing_slash(args.prefix)
    args.gamepack_prefix = ensure_trailing_slash(args.gamepack_prefix)
    args.registry_prefix = ensure_trailing_slash(args.registry_prefix)

    seasons = resolve_requested_seasons(args)
    if not seasons:
        print("No seasons selected. Provide --season or a date/date-range.")
        return 0

    s3_client = boto3.client("s3", region_name=args.region)
    gamepack_root = f"{args.prefix}{args.gamepack_prefix}"
    writes = []

    for season in seasons:
        window = season_window(season)
        if not window:
            continue
        start_date, end_date = window
        keys = list_gamepack_keys_for_window(s3_client, args.bucket, gamepack_root, start_date, end_date)
        gamepacks = load_gamepacks(s3_client, args.bucket, keys)
        registry = build_identity_registry(gamepacks)
        payload = serialize_registry(registry, season=season)
        target_key = f"{args.prefix}{args.registry_prefix}{season}.json.gz"
        writes.append((season, target_key, payload, len(keys), len(payload["byTeamName"]), len(payload["uniqueByName"])))

    if not writes:
        print("No registry writes produced.")
        return 0

    for season, key, payload, gamepack_count, team_name_count, unique_name_count in writes:
        print(
            f"{season}: {gamepack_count} gamepack(s), "
            f"{team_name_count} team-name entries, {unique_name_count} unique-name entries"
        )
        if not args.dry_run:
            write_registry(s3_client, args.bucket, key, payload)
            print(f"  wrote {key}")

    if args.dry_run:
        print(f"DRY RUN: would write {len(writes)} registry file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
