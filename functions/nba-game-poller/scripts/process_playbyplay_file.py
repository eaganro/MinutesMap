#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


HERE = Path(__file__).resolve()
LAMBDA_DIR = HERE.parents[1]  # functions/nba-game-poller
sys.path.insert(0, str(LAMBDA_DIR))

from nba_game_poller.playbyplay_processing import process_playbyplay_payload  # noqa: E402


def _load_actions(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("actions"), list):
            return payload["actions"]
        game = payload.get("game")
        if isinstance(game, dict) and isinstance(game.get("actions"), list):
            return game["actions"]
    return None


def _infer_team_ids(actions):
    team_ids = sorted({a.get("teamId") for a in actions if isinstance(a, dict) and (a.get("teamId") or 0) > 0})
    if len(team_ids) != 2:
        return None, None

    counts = {team_ids[0]: {"h": 0, "v": 0}, team_ids[1]: {"h": 0, "v": 0}}
    for a in actions:
        if not isinstance(a, dict):
            continue
        tid = a.get("teamId")
        loc = a.get("location")
        if tid in counts and loc in ("h", "v"):
            counts[tid][loc] += 1

    # Best-effort: team with more 'h' events is home; more 'v' is away.
    a_id, b_id = team_ids
    if counts[a_id]["h"] > counts[b_id]["h"]:
        return b_id, a_id
    if counts[b_id]["h"] > counts[a_id]["h"]:
        return a_id, b_id
    # Tie: fall back to "more v" for away.
    if counts[a_id]["v"] > counts[b_id]["v"]:
        return a_id, b_id
    if counts[b_id]["v"] > counts[a_id]["v"]:
        return b_id, a_id

    return team_ids[0], team_ids[1]


def main():
    parser = argparse.ArgumentParser(
        description="Run nba-game-poller play-by-play processing on a local JSON file and print/write the processed payload."
    )
    parser.add_argument("input", type=Path, help="Path to JSON file (actions array, NBA response, or processed payload).")
    parser.add_argument("--game-id", default=None, help="Game ID for the output (defaults to input file stem).")
    parser.add_argument("--home-team-id", default=None, help="Home teamId (inferred if omitted).")
    parser.add_argument("--away-team-id", default=None, help="Away teamId (inferred if omitted).")
    parser.add_argument(
        "--slim",
        action="store_true",
        help="Omit `actions` and `allActions` from output (recommended for storage/transfer).",
    )
    parser.add_argument("--out", type=Path, default=None, help="Write output JSON to this file (defaults to stdout).")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output.")
    args = parser.parse_args()

    raw = json.loads(args.input.read_text(encoding="utf-8"))

    if isinstance(raw, dict) and raw.get("schemaVersion") == 1 and "actions" not in raw:
        # Already processed (slim). Just echo it.
        processed = raw
    else:
        actions = _load_actions(raw)
        if actions is None:
            raise SystemExit("Could not find an actions list in input JSON.")

        away_team_id = args.away_team_id
        home_team_id = args.home_team_id
        if not (away_team_id and home_team_id):
            inferred_away, inferred_home = _infer_team_ids(actions)
            away_team_id = away_team_id or inferred_away
            home_team_id = home_team_id or inferred_home

        game_id = args.game_id or args.input.stem
        processed = process_playbyplay_payload(
            game_id=game_id,
            actions=actions,
            away_team_id=away_team_id,
            home_team_id=home_team_id,
            include_actions=not args.slim,
            include_all_actions=not args.slim,
        )

    indent = 2 if args.pretty else None
    out_text = json.dumps(processed, ensure_ascii=False, indent=indent)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(out_text, encoding="utf-8")
    else:
        print(out_text)


if __name__ == "__main__":
    main()

