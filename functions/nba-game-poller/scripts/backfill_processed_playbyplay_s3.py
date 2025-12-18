#!/usr/bin/env python3
"""
Backfill processed slim play-by-play payloads in S3.

Reads legacy raw play-by-play objects (actions array) from:
  s3://<bucket>/data/playByPlayData/<gameId>.json.gz

Writes slim processed payloads to:
  s3://<bucket>/data/processed-data/playByPlayData/<gameId>.json.gz
"""

import argparse
import gzip
import json
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


HERE = Path(__file__).resolve()
LAMBDA_DIR = HERE.parents[1]  # functions/nba-game-poller
sys.path.insert(0, str(LAMBDA_DIR))

from nba_game_poller.playbyplay_processing import (  # noqa: E402
    infer_team_ids_from_actions,
    process_playbyplay_payload,
)
from nba_game_poller.storage import upload_json_to_s3  # noqa: E402


def _maybe_gunzip(body_bytes: bytes) -> bytes:
    if body_bytes.startswith(b"\x1f\x8b"):
        return gzip.decompress(body_bytes)
    return body_bytes


def _parse_actions(json_bytes: bytes):
    payload = json.loads(json_bytes)
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        # NBA style: {"game": {"actions": [...]}}
        game = payload.get("game")
        if isinstance(game, dict) and isinstance(game.get("actions"), list):
            return game["actions"]
        # Already processed: {"actions": [...]}
        if isinstance(payload.get("actions"), list):
            return payload["actions"]
    return None


def _game_id_from_key(key: str) -> str | None:
    name = key.split("/")[-1]
    if name.endswith(".json.gz"):
        return name[: -len(".json.gz")]
    if name.endswith(".json"):
        return name[: -len(".json")]
    return None


def _object_exists(s3_client, bucket: str, key: str) -> bool:
    try:
        s3_client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        if e.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
            return False
        code = e.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def process_one(
    *,
    s3_client,
    bucket: str,
    source_key: str,
    dest_prefix: str,
    overwrite: bool,
    dry_run: bool,
) -> tuple[bool, str]:
    game_id = _game_id_from_key(source_key)
    if not game_id:
        return False, f"skip (unrecognized key): {source_key}"

    dest_key_no_gz = f"{dest_prefix}{game_id}.json"
    dest_key_gz = f"{dest_key_no_gz}.gz"

    if not overwrite and _object_exists(s3_client, bucket, dest_key_gz):
        return False, f"skip (exists): {dest_key_gz}"

    try:
        resp = s3_client.get_object(Bucket=bucket, Key=source_key)
        body = resp["Body"].read()
    except ClientError as e:
        return False, f"error (get_object): {source_key}: {e}"

    try:
        raw_json = _maybe_gunzip(body)
        actions = _parse_actions(raw_json)
        if not actions:
            return False, f"skip (no actions): {source_key}"

        away_team_id, home_team_id = infer_team_ids_from_actions(actions)
        if not (away_team_id and home_team_id):
            return False, f"skip (cannot infer teamIds): {source_key}"

        last_desc = (actions[-1].get("description", "") if actions else "").strip()
        is_final = last_desc.startswith("Game End")

        processed = process_playbyplay_payload(
            game_id=game_id,
            actions=actions,
            away_team_id=away_team_id,
            home_team_id=home_team_id,
            include_actions=False,
            include_all_actions=False,
        )
    except Exception as e:
        return False, f"error (process): {source_key}: {e}"

    if dry_run:
        return True, f"dry-run: would write {dest_key_gz}"

    try:
        upload_json_to_s3(
            s3_client=s3_client,
            bucket=bucket,
            prefix="",
            key=dest_key_no_gz,
            data=processed,
            is_final=is_final,
        )
        return True, f"wrote: {dest_key_gz}"
    except Exception as e:
        return False, f"error (put_object): {dest_key_gz}: {e}"


def main():
    parser = argparse.ArgumentParser(description="Backfill slim processed play-by-play payloads in S3.")
    parser.add_argument("--bucket", required=True, help="S3 bucket name.")
    parser.add_argument(
        "--source-prefix",
        default="data/playByPlayData/",
        help="Prefix containing legacy raw play-by-play objects.",
    )
    parser.add_argument(
        "--dest-prefix",
        default="data/processed-data/playByPlayData/",
        help="Prefix to write slim processed play-by-play objects.",
    )
    parser.add_argument("--start-after", default=None, help="Start listing after this S3 key (resume).")
    parser.add_argument("--max-items", type=int, default=None, help="Process at most N objects (debugging).")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite already-processed objects.")
    parser.add_argument("--dry-run", action="store_true", help="List what would be written without uploading.")
    parser.add_argument("--region", default=None, help="AWS region (optional).")
    parser.add_argument("--profile", default=None, help="AWS profile name (optional).")
    args = parser.parse_args()

    source_prefix = args.source_prefix
    if source_prefix and not source_prefix.endswith("/"):
        source_prefix += "/"
    dest_prefix = args.dest_prefix
    if dest_prefix and not dest_prefix.endswith("/"):
        dest_prefix += "/"

    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    s3_client = session.client("s3")

    paginator = s3_client.get_paginator("list_objects_v2")
    pagination_args = {"Bucket": args.bucket, "Prefix": source_prefix}
    if args.start_after:
        pagination_args["StartAfter"] = args.start_after

    processed_count = 0
    skipped_count = 0
    error_count = 0

    for page in paginator.paginate(**pagination_args):
        for obj in page.get("Contents", []):
            key = obj.get("Key")
            if not key:
                continue
            if not (key.endswith(".json.gz") or key.endswith(".json")):
                continue

            ok, msg = process_one(
                s3_client=s3_client,
                bucket=args.bucket,
                source_key=key,
                dest_prefix=dest_prefix,
                overwrite=args.overwrite,
                dry_run=args.dry_run,
            )
            print(msg)

            if ok:
                processed_count += 1
            else:
                if msg.startswith("error"):
                    error_count += 1
                else:
                    skipped_count += 1

            if args.max_items is not None and (processed_count + skipped_count + error_count) >= args.max_items:
                print("Reached --max-items limit, stopping.")
                print(f"processed={processed_count} skipped={skipped_count} errors={error_count}")
                return

    print(f"done: processed={processed_count} skipped={skipped_count} errors={error_count}")


if __name__ == "__main__":
    main()

