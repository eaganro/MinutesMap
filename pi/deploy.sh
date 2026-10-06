#!/usr/bin/env bash
# Copy the Pi poller (and the poller code it imports) to the Pi and install its dependencies.
# Does not start or stop anything; see pi/README.md for switching modes.
# Usage: bash pi/deploy.sh [host]   (default raspberrypi; deploys locally when run on that host
#                                    or with host "local", e.g. from ~/MinutesMap on the Pi)
set -euo pipefail

HOST="${1:-raspberrypi}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$HOST" = "local" ] || [ "$HOST" = "$(hostname)" ]; then
  run() { bash -c "$1"; }
  DEST="$HOME/"
else
  run() { ssh "$HOST" "$1"; }
  DEST="$HOST:"
fi

run 'mkdir -p ~/minutesmap-poller ~/.config/systemd/user'
rsync -a --delete --exclude __pycache__ "$ROOT/functions/nba-game-poller/" "${DEST}minutesmap-poller/nba-game-poller/"
rsync -a "$ROOT/pi/run_poller.py" "${DEST}minutesmap-poller/"
rsync -a "$ROOT/pi/minutesmap-poller.service" "${DEST}.config/systemd/user/"
run 'cd ~/minutesmap-poller && { [ -d .venv ] || python3 -m venv .venv; } && .venv/bin/pip install -q boto3 && systemctl --user daemon-reload'
echo "Deployed to ${HOST}:~/minutesmap-poller"
