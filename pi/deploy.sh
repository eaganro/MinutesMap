#!/usr/bin/env bash
# Deploy the Pi poller from git: fast-forward the Pi's ~/MinutesMap checkout to origin/main and
# copy the poller (and the poller code it imports) into ~/minutesmap-poller, which the service runs.
# Only pushed commits are deployed. Does not start or stop anything; restart the service to pick it
# up, and see pi/README.md for switching modes.
# Usage: bash pi/deploy.sh [host]   (default raspberrypi; deploys locally when run on that host
#                                    or with host "local", e.g. from ~/MinutesMap on the Pi)
set -euo pipefail

HOST="${1:-raspberrypi}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$HOST" != "local" ] && [ "$HOST" != "$(hostname)" ]; then
  # Pull first so the Pi runs the deploy script from the commit it deploys.
  ssh "$HOST" 'cd ~/MinutesMap && git pull --ff-only -q origin main && bash pi/deploy.sh local'
  if git -C "$ROOT" rev-parse --verify -q HEAD >/dev/null; then
    deployed="$(ssh "$HOST" 'cat ~/minutesmap-poller/DEPLOYED')"
    if [ "$(git -C "$ROOT" rev-parse HEAD)" != "${deployed%% *}" ]; then
      echo "Note: local HEAD $(git -C "$ROOT" rev-parse --short HEAD) differs from the deployed commit; push first to deploy it."
    fi
  fi
  exit 0
fi

cd "$ROOT"
if [ "$(git branch --show-current)" != "main" ]; then
  echo "Refusing to deploy: $ROOT is not on main." >&2
  exit 1
fi
if [ -n "$(git status --porcelain -- functions/nba-game-poller pi)" ]; then
  echo "Refusing to deploy: uncommitted changes under functions/nba-game-poller or pi in $ROOT." >&2
  exit 1
fi
git pull --ff-only -q origin main

mkdir -p ~/minutesmap-poller ~/.config/systemd/user
rsync -a --delete --exclude __pycache__ "$ROOT/functions/nba-game-poller/" ~/minutesmap-poller/nba-game-poller/
rsync -a "$ROOT/pi/run_poller.py" ~/minutesmap-poller/
rsync -a "$ROOT/pi/minutesmap-poller.service" ~/.config/systemd/user/
cd ~/minutesmap-poller
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q boto3
systemctl --user daemon-reload
echo "$(git -C "$ROOT" rev-parse HEAD) $(date -Is)" > ~/minutesmap-poller/DEPLOYED
echo "Deployed $(git -C "$ROOT" log --oneline -1) to $(hostname):~/minutesmap-poller (restart minutesmap-poller to run it)"
