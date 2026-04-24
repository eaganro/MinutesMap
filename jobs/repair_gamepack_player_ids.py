import argparse
import gzip
import json
import os
import re
from datetime import datetime, timedelta

import boto3
from botocore.exceptions import ClientError

from player_id_registry import (
    build_identity_registry,
    derive_season_label,
    deserialize_registry,
    player_full_name,
    resolve_player_id,
    safe_int,
    slugify,
)


DEFAULT_BUCKET = os.environ.get("DATA_BUCKET", "roryeagan.com-nba-processed-data")
DEFAULT_REGION = os.environ.get("AWS_REGION", "us-east-1")
DEFAULT_PREFIX = "data/"
DEFAULT_GAMEPACK_PREFIX = "gamepack/"
DEFAULT_SCHEDULE_PREFIX = "schedule/"
DEFAULT_REGISTRY_PREFIX = "private/player-id-registry/"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
GAMEPACK_KEY_RE = re.compile(r"(\d{4}-\d{2}-\d{2})-[^/]+\.json\.gz$")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Repair missing player ids inside stored gamepack box payloads."
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
        "--registry-prefix",
        default=DEFAULT_REGISTRY_PREFIX,
        help="Registry prefix relative to --prefix (default: private/player-id-registry/).",
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
    payload = gunzip_payload(payload)
    data = json.loads(payload.decode("utf-8"))
    meta = {
        "cache_control": resp.get("CacheControl"),
        "content_type": resp.get("ContentType") or "application/json",
        "content_encoding": "gzip",
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
    full_prefix = f"{prefix}{date_str}-"
    keys = []
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=full_prefix):
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


def extract_date_from_key(key):
    match = GAMEPACK_KEY_RE.search(key or "")
    return match.group(1) if match else None


def load_registry_for_seasons(s3_client, bucket, prefix, seasons):
    registries = []
    missing = []
    for season in sorted(set(seasons)):
        key = f"{prefix}{season}.json.gz"
        payload, _ = load_json_from_s3(
            s3_client=s3_client,
            bucket=bucket,
            key=key,
            allow_missing=True,
        )
        if not isinstance(payload, dict):
            missing.append(key)
            continue
        registries.append(deserialize_registry(payload))
    merged = {"byTeamName": {}, "uniqueByName": {}}
    for registry in registries:
        merged["byTeamName"].update(registry.get("byTeamName") or {})
        merged["uniqueByName"].update(registry.get("uniqueByName") or {})
    return merged, missing


def patch_gamepack_player_ids(gamepack, registry):
    if not isinstance(gamepack, dict):
        return None

    patched = json.loads(json.dumps(gamepack))
    teams = (((patched.get("box") or {}).get("teams") or {}))
    changed = 0
    unresolved = []

    for side in ("away", "home"):
        team = teams.get(side) or {}
        team_abbr = str(team.get("abbr") or "").strip().upper()
        players = team.get("players") or []
        for player in players:
            if safe_int(player.get("id")) > 0:
                continue
            resolved = resolve_player_id(player, team_abbr, registry)
            if resolved:
                player["id"] = resolved
                changed += 1
            else:
                unresolved.append(
                    {
                        "team": team_abbr,
                        "name": player_full_name(player),
                        "slug": slugify(player_full_name(player)),
                    }
                )

    return {
        "gamepack": patched,
        "changed": changed,
        "unresolved": unresolved,
    }


def write_gamepack(s3_client, bucket, key, gamepack, meta):
    body = gzip_json(gamepack)
    kwargs = {
        "Bucket": bucket,
        "Key": key,
        "Body": body,
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
    args.registry_prefix = ensure_trailing_slash(args.registry_prefix)

    s3_client = boto3.client("s3", region_name=args.region)
    keys = collect_gamepack_keys(args, s3_client)
    if not keys:
        print("No gamepacks found for the requested scope.")
        return 0

    seasons = [
        derive_season_label(extract_date_from_key(key))
        for key in keys
        if extract_date_from_key(key)
    ]
    registry_root = f"{args.prefix}{args.registry_prefix}"
    registry, missing_registry_keys = load_registry_for_seasons(
        s3_client,
        args.bucket,
        registry_root,
        seasons,
    )
    if missing_registry_keys:
        print("Missing registry file(s):")
        for key in missing_registry_keys:
            print(f"  {key}")
        print("Build the registry first with jobs/build_player_id_registry.py.")
        return 1

    loaded = []
    metas = {}
    for key in keys:
        gamepack, meta = load_json_from_s3(
            s3_client=s3_client,
            bucket=args.bucket,
            key=key,
            allow_missing=True,
        )
        if not isinstance(gamepack, dict):
            continue
        loaded.append((key, gamepack))
        metas[key] = meta or {}

    changed_gamepacks = 0
    patched_players = 0
    unresolved_players = 0
    unresolved_samples = []
    pending_writes = []

    for key, gamepack in loaded:
        result = patch_gamepack_player_ids(gamepack, registry)
        if not result:
            continue
        if result["changed"] > 0:
            changed_gamepacks += 1
            patched_players += result["changed"]
            pending_writes.append((key, result["gamepack"]))
        unresolved_players += len(result["unresolved"])
        for entry in result["unresolved"]:
            if len(unresolved_samples) >= 10:
                break
            unresolved_samples.append(f"{key.split('/')[-1]}:{entry['team']}:{entry['name'] or entry['slug']}")

    print(f"Scanned {len(loaded)} target gamepack(s).")
    print(f"Loaded registry for {len(set(seasons))} season(s).")
    print(f"Would patch {patched_players} player id(s) across {changed_gamepacks} gamepack(s).")
    print(f"Unresolved missing ids after inference: {unresolved_players}.")
    if unresolved_samples:
        print("Sample unresolved:")
        for item in unresolved_samples:
            print(f"  {item}")

    if args.dry_run:
        return 0

    for key, gamepack in pending_writes:
        write_gamepack(s3_client, args.bucket, key, gamepack, metas.get(key))

    print(f"Wrote {len(pending_writes)} repaired gamepack(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
