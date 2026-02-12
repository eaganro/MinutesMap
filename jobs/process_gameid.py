import argparse
import json
import os
import sys
import uuid

ROOT = os.path.dirname(os.path.dirname(__file__))
DEFAULT_DISTRIBUTION_ID = "E27FQC8AKVWFV6"
sys.path.insert(0, os.path.join(ROOT, "functions", "nba-game-poller"))

import boto3  # noqa: E402

from nba_game_poller.nba_api import fetch_nba_data_urllib  # noqa: E402
from nba_game_poller.playbyplay_processing import (  # noqa: E402
    infer_team_ids_from_actions,
    process_playbyplay_payload,
)
from nba_game_poller.gamepack_utils import (  # noqa: E402
    build_box_payload,
    build_game_key,
    build_player_label_map,
    extract_oncourt_ids,
    extract_oncourt_names,
)
from nba_game_poller.storage import upload_json_to_s3  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser(
        description="Download play-by-play + boxscore for a gameId and process play-by-play."
    )
    parser.add_argument("game_id", help="NBA game id, e.g. 0022500710")
    parser.add_argument(
        "--out-dir",
        default=".",
        help="Directory to write outputs (default: current directory).",
    )
    parser.add_argument(
        "--write-raw",
        action="store_true",
        help="Write raw playbyplay/boxscore JSON files.",
    )
    parser.add_argument(
        "--write-flow",
        action="store_true",
        help="Write processed gameflow JSON file.",
    )
    parser.add_argument(
        "--include-feed",
        action="store_true",
        help="Include trimmed feed actions in gameflow output.",
    )
    parser.add_argument(
        "--exclude-events",
        action="store_true",
        help="Exclude aggregated events list from gameflow output.",
    )
    parser.add_argument(
        "--write-gamepack",
        action="store_true",
        help="Write the combined gamepack JSON with box + flow.",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Upload the gamepack to S3 at data/gamepack/{game_key}.json.gz.",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("DATA_BUCKET", "roryeagan.com-nba-processed-data"),
        help="S3 bucket for uploads (default: DATA_BUCKET env or roryeagan.com-nba-processed-data).",
    )
    parser.add_argument(
        "--prefix",
        default="data/",
        help="S3 prefix for uploads (default: data/).",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", "us-east-1"),
        help="AWS region (default: AWS_REGION env or us-east-1).",
    )
    parser.add_argument(
        "--no-invalidate",
        action="store_true",
        help="Skip CloudFront invalidation even when uploading.",
    )
    parser.add_argument(
        "--distribution-id",
        default=(
            os.environ.get("CLOUDFRONT_DISTRIBUTION_ID")
            or os.environ.get("CLOUDFRONT_DIST_ID")
            or DEFAULT_DISTRIBUTION_ID
        ),
        help="CloudFront distribution ID for invalidation.",
    )
    parser.add_argument(
        "--no-seed",
        action="store_true",
        help="Disable seeding on-court starters when period == 1.",
    )
    return parser.parse_args()


def ensure_out_dir(path):
    if not path:
        return "."
    os.makedirs(path, exist_ok=True)
    return path


def invalidate_cloudfront(*, distribution_id, path, region):
    if not distribution_id:
        print("Skipping CloudFront invalidation: missing distribution id.")
        return False
    client = boto3.client("cloudfront", region_name=region)
    resp = client.create_invalidation(
        DistributionId=distribution_id,
        InvalidationBatch={
            "Paths": {"Quantity": 1, "Items": [path]},
            "CallerReference": f"{path}-{uuid.uuid4().hex}",
        },
    )
    invalidation_id = resp.get("Invalidation", {}).get("Id")
    if invalidation_id:
        print(f"Created CloudFront invalidation {invalidation_id} for {path}")
    else:
        print(f"Created CloudFront invalidation for {path}")
    return True


def main():
    args = parse_args()
    wants_output = args.write_raw or args.write_flow or args.write_gamepack
    out_dir = ensure_out_dir(args.out_dir) if wants_output else None
    game_id = str(args.game_id)

    play_url = f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{game_id}.json"
    box_url = f"https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{game_id}.json"

    play_data, _ = fetch_nba_data_urllib(play_url)
    box_data, _ = fetch_nba_data_urllib(box_url)

    if not play_data:
        print(f"Missing play-by-play for {game_id}.")
        return 1
    if not box_data:
        print(f"Missing boxscore for {game_id}.")
        return 1

    if args.write_raw:
        play_path = os.path.join(out_dir, f"playbyplay_{game_id}.json")
        box_path = os.path.join(out_dir, f"boxscore_{game_id}.json")
        with open(play_path, "w", encoding="utf-8") as f:
            json.dump(play_data, f, indent=2)
        with open(box_path, "w", encoding="utf-8") as f:
            json.dump(box_data, f, indent=2)
        print(f"Wrote {play_path}")
        print(f"Wrote {box_path}")

    actions = play_data.get("game", {}).get("actions", [])
    box_game = box_data.get("game", {})
    if not actions:
        print("Play-by-play has no actions; skipping processing.")
        return 1
    if not isinstance(box_game, dict):
        print("Boxscore payload missing game data; skipping processing.")
        return 1

    home_team_id = box_game.get("homeTeam", {}).get("teamId") or box_game.get("homeTeamId")
    away_team_id = box_game.get("awayTeam", {}).get("teamId") or box_game.get("awayTeamId")
    play_game = play_data.get("game", {})
    home_team_id = home_team_id or play_game.get("homeTeamId") or play_game.get("homeTeam", {}).get("teamId")
    away_team_id = away_team_id or play_game.get("awayTeamId") or play_game.get("awayTeam", {}).get("teamId")

    if actions and not (home_team_id and away_team_id):
        inferred_away, inferred_home = infer_team_ids_from_actions(actions)
        away_team_id = away_team_id or inferred_away
        home_team_id = home_team_id or inferred_home

    last_action = actions[-1] if actions else None
    seed_period = (last_action or {}).get("period") or 1
    seed_clock = (last_action or {}).get("clock") or box_game.get("gameClock")
    seed_home = []
    seed_away = []
    seed_home_ids = []
    seed_away_ids = []
    home_player_labels = build_player_label_map(box_game.get("homeTeam"))
    away_player_labels = build_player_label_map(box_game.get("awayTeam"))
    if not args.no_seed and seed_period == 1:
        seed_home = extract_oncourt_names(box_game.get("homeTeam"))
        seed_away = extract_oncourt_names(box_game.get("awayTeam"))
        seed_home_ids = extract_oncourt_ids(box_game.get("homeTeam"))
        seed_away_ids = extract_oncourt_ids(box_game.get("awayTeam"))

    processed = process_playbyplay_payload(
        game_id=game_id,
        actions=actions,
        away_team_id=away_team_id,
        home_team_id=home_team_id,
        away_player_labels=away_player_labels,
        home_player_labels=home_player_labels,
        include_actions=args.include_feed,
        include_all_actions=not args.exclude_events,
        seed_home=seed_home,
        seed_away=seed_away,
        seed_home_ids=seed_home_ids,
        seed_away_ids=seed_away_ids,
        seed_clock=seed_clock,
        seed_period=seed_period,
    )

    if args.write_flow:
        flow_path = os.path.join(out_dir, f"gameflow_{game_id}.json")
        with open(flow_path, "w", encoding="utf-8") as f:
            json.dump(processed, f, indent=2)
        print(f"Wrote {flow_path}")

    if args.write_gamepack or args.upload:
        game_key = build_game_key(box_game, game_id)
        gamepack = {
            "v": 1,
            "id": game_id,
            "publicId": game_key,
            "box": build_box_payload(box_game),
            "flow": processed,
        }
        if args.write_gamepack:
            pack_path = os.path.join(out_dir, f"gamepack_{game_key}.json")
            with open(pack_path, "w", encoding="utf-8") as f:
                json.dump(gamepack, f, indent=2)
            print(f"Wrote {pack_path}")

        if args.upload:
            last_desc = (actions[-1].get("description") or "").strip() if actions else ""
            is_play_final = last_desc.startswith("Game End")
            status_text = (box_game.get("gameStatusText") or "").strip()
            is_box_final = status_text.startswith("Final")
            is_final = is_play_final or is_box_final
            prefix = args.prefix or ""
            if prefix and not prefix.endswith("/"):
                prefix += "/"
            invalidation_path = f"/{prefix}gamepack/{game_key}.json.gz"

            s3_client = boto3.client("s3", region_name=args.region)
            upload_json_to_s3(
                s3_client=s3_client,
                bucket=args.bucket,
                prefix=prefix,
                key=f"gamepack/{game_key}.json",
                data=gamepack,
                is_final=is_final,
            )
            if not args.no_invalidate:
                invalidate_cloudfront(
                    distribution_id=args.distribution_id,
                    path=invalidation_path,
                    region=args.region,
                )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
