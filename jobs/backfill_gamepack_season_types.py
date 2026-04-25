import argparse
import gzip
import json
import os
import re
import sys
from datetime import datetime, timedelta

import boto3
from botocore.exceptions import ClientError


ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, "functions", "nba-game-poller"))

from nba_game_poller.season_types import derive_season_type  # noqa: E402


DEFAULT_BUCKET = os.environ.get("DATA_BUCKET", "roryeagan.com-nba-processed-data")
DEFAULT_REGION = os.environ.get("AWS_REGION", "us-east-1")
DEFAULT_PREFIX = "data/"
DEFAULT_GAMEPACK_PREFIX = "gamepack/"
DEFAULT_SCHEDULE_PREFIX = "schedule/"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backfill canonical seasonType fields on stored gamepacks."
    )
    parser.add_argument("--date", default=None, help="Single date YYYY-MM-DD.")
    parser.add_argument("--start-date", default=None, help="Start date YYYY-MM-DD.")
    parser.add_argument("--end-date", default=None, help="End date YYYY-MM-DD.")
    parser.add_argument(
        "--all-s3",
        action="store_true",
        help="Process every date that has a schedule file in S3.",
    )
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
        "--schedule-prefix",
        default=DEFAULT_SCHEDULE_PREFIX,
        help="Schedule prefix at bucket root (default: schedule/).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing any gamepacks.",
    )
    parser.add_argument(
        "--max-dates",
        type=int,
        default=None,
        help="Optional date cap for safety.",
    )
    return parser.parse_args()


def ensure_trailing_slash(value):
    if not value:
        return ""
    return value if value.endswith("/") else f"{value}/"


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


def gunzip_payload(payload):
    if payload.startswith(b"\x1f\x8b"):
        return gzip.decompress(payload)
    return payload


def gzip_json(data):
    return gzip.compress(json.dumps(data).encode("utf-8"))


def load_json_from_s3(*, s3_client, bucket, key, allow_missing=False):
    try:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if allow_missing and code in ("NoSuchKey", "404", "NotFound"):
            return None, None
        raise
    payload = resp["Body"].read()
    data = json.loads(gunzip_payload(payload).decode("utf-8"))
    meta = {
        "cache_control": resp.get("CacheControl"),
        "content_type": resp.get("ContentType") or "application/json",
    }
    return data, meta


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


def list_gamepack_keys_for_date(s3_client, bucket, prefix, date_str):
    keys = []
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=f"{prefix}{date_str}-"):
        for entry in page.get("Contents", []) or []:
            key = entry.get("Key") or ""
            if key.endswith(".json.gz"):
                keys.append(key)
    return sorted(keys)


def collect_gamepack_keys(args, s3_client):
    dates = []
    if args.date:
        dates = [args.date]
    elif args.start_date and args.end_date:
        dates = expand_date_range(args.start_date, args.end_date)
    elif args.all_s3:
        dates = list_schedule_dates_from_s3(s3_client, args.bucket, args.schedule_prefix)

    if args.max_dates is not None:
        dates = dates[: max(0, args.max_dates)]

    keys = []
    seen = set()
    gamepack_root = f"{args.prefix}{args.gamepack_prefix}"
    for date_str in dates:
        for key in list_gamepack_keys_for_date(s3_client, args.bucket, gamepack_root, date_str):
            if key in seen:
                continue
            seen.add(key)
            keys.append(key)
    return keys


def patch_gamepack_season_type(gamepack):
    if not isinstance(gamepack, dict):
        return None

    box = gamepack.get("box") or {}
    season_type = derive_season_type(
        gamepack,
        box,
        nba_game_id=gamepack.get("id") or gamepack.get("nbaGameId"),
    )
    if not season_type:
        return None

    changed = False
    patched = dict(gamepack)
    if patched.get("seasonType") != season_type:
        patched["seasonType"] = season_type
        changed = True

    if isinstance(box, dict) and box.get("seasonType") != season_type:
        patched_box = dict(box)
        patched_box["seasonType"] = season_type
        patched["box"] = patched_box
        changed = True

    return {
        "gamepack": patched,
        "seasonType": season_type,
        "changed": changed,
    }


def write_gamepack(s3_client, bucket, key, gamepack, meta):
    kwargs = {
        "Bucket": bucket,
        "Key": key,
        "Body": gzip_json(gamepack),
        "ContentType": (meta or {}).get("content_type") or "application/json",
        "ContentEncoding": "gzip",
    }
    cache_control = (meta or {}).get("cache_control")
    if cache_control:
        kwargs["CacheControl"] = cache_control
    s3_client.put_object(**kwargs)


def main():
    args = parse_args()
    args.prefix = ensure_trailing_slash(args.prefix)
    args.gamepack_prefix = ensure_trailing_slash(args.gamepack_prefix)
    args.schedule_prefix = ensure_trailing_slash(args.schedule_prefix)

    s3_client = boto3.client("s3", region_name=args.region)
    keys = collect_gamepack_keys(args, s3_client)
    if not keys:
        print("No gamepacks found for the requested scope.")
        return 0

    scanned = 0
    changed_by_type = {}
    pending_writes = []

    for key in keys:
        gamepack, meta = load_json_from_s3(
            s3_client=s3_client,
            bucket=args.bucket,
            key=key,
            allow_missing=True,
        )
        if not isinstance(gamepack, dict):
            continue
        scanned += 1
        result = patch_gamepack_season_type(gamepack)
        if not result or not result["changed"]:
            continue
        changed_by_type[result["seasonType"]] = changed_by_type.get(result["seasonType"], 0) + 1
        pending_writes.append((key, result["gamepack"], meta or {}))

    print(f"Scanned {scanned} target gamepack(s).")
    print(f"Would update seasonType on {len(pending_writes)} gamepack(s).")
    for season_type, count in sorted(changed_by_type.items()):
        print(f"  {season_type}: {count}")

    if args.dry_run:
        return 0

    for key, gamepack, meta in pending_writes:
        write_gamepack(s3_client, args.bucket, key, gamepack, meta)

    print(f"Wrote {len(pending_writes)} gamepack(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
