#!/usr/bin/env bash
# Deploy pushed poller changes on the Pi without a manual step. minutesmap-autodeploy.timer runs
# this every minute from the Pi's ~/MinutesMap checkout. When origin/main changes the poller or
# its Pi files, it waits for CI: the "Backend & Infra" workflow (which runs the poller tests) must
# have passed for the latest commit that touched functions/ (pi/-only changes have no CI). Then it
# runs pi/deploy.sh and restarts minutesmap-poller (only if it is running), live games or not.
# GitHub allows 60 unauthenticated API calls an hour, so the CI status is only fetched while a
# change is waiting, and a failed commit is remembered instead of re-checked every minute.
set -euo pipefail

REPO="$HOME/MinutesMap"
DEST="$HOME/minutesmap-poller"
SERVICE=minutesmap-poller
CI_RUNS_URL="https://api.github.com/repos/eaganro/MinutesMap/actions/workflows/infra.yml/runs"
NOTE_FILE="$DEST/.autodeploy-note"
CI_FAILED_FILE="$DEST/.autodeploy-ci-failed"
DEPLOY_PATHS=(
  functions/nba-game-poller
  pi/run_poller.py
  pi/deploy.sh
  pi/minutesmap-poller.service
  pi/minutesmap-autodeploy.service
  pi/minutesmap-autodeploy.timer
)

# Log a waiting reason once per commit instead of every 5 minutes.
note() {
  local line="$target $1"
  if [ "$(cat "$NOTE_FILE" 2>/dev/null)" != "$line" ]; then
    echo "$1"
    echo "$line" > "$NOTE_FILE"
  fi
}

git -C "$REPO" fetch -q origin main
target="$(git -C "$REPO" rev-parse origin/main)"
deployed="$(cut -d' ' -f1 "$DEST/DEPLOYED" 2>/dev/null || true)"
[ "$target" = "$deployed" ] && exit 0

if [ -n "$deployed" ] && git -C "$REPO" cat-file -e "${deployed}^{commit}" 2>/dev/null; then
  range="$deployed..$target"
  [ -z "$(git -C "$REPO" diff --name-only "$deployed" "$target" -- "${DEPLOY_PATHS[@]}")" ] && exit 0
else
  range="$target"
fi

ci_commit="$(git -C "$REPO" log -1 --format=%H "$range" -- functions)"
if [ -n "$ci_commit" ] && [ "$(cat "$CI_FAILED_FILE" 2>/dev/null)" = "$ci_commit" ]; then
  exit 0
fi
if [ -n "$ci_commit" ]; then
  ci="$(curl -fsS --max-time 20 "$CI_RUNS_URL?head_sha=$ci_commit&per_page=1" | python3 -c '
import json, sys
runs = json.load(sys.stdin).get("workflow_runs") or []
print(" ".join(str(runs[0][key]) for key in ("status", "conclusion")) if runs else "none")
')" || { note "Could not check CI for ${ci_commit:0:7}; will retry."; exit 0; }
  case "$ci" in
    "completed success") ;;
    completed*)
      echo "$ci_commit" > "$CI_FAILED_FILE"
      note "CI ${ci#completed } for ${ci_commit:0:7}; not deploying until a newer commit passes."
      exit 0
      ;;
    *) note "Waiting for CI on ${ci_commit:0:7} ($ci)."; exit 0 ;;
  esac
fi

bash "$REPO/pi/deploy.sh" local
systemctl --user try-restart "$SERVICE"
rm -f "$NOTE_FILE"
echo "Auto-deployed $(cut -d' ' -f1 "$DEST/DEPLOYED" | cut -c1-7) and restarted $SERVICE if it was running."
