#!/usr/bin/env bash
# Copy the Pi poller (and the poller code it imports) to the Pi and install its dependencies.
# Does not start or stop anything; see pi/README.md for switching modes.
set -euo pipefail

HOST="${1:-raspberrypi}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ssh "$HOST" 'mkdir -p ~/minutesmap-poller ~/.config/systemd/user'
rsync -a --delete --exclude __pycache__ "$ROOT/functions/nba-game-poller/" "$HOST:minutesmap-poller/nba-game-poller/"
rsync -a "$ROOT/pi/run_poller.py" "$HOST:minutesmap-poller/"
rsync -a "$ROOT/pi/minutesmap-poller.service" "$HOST:.config/systemd/user/"
ssh "$HOST" 'cd ~/minutesmap-poller && { [ -d .venv ] || python3 -m venv .venv; } && .venv/bin/pip install -q boto3 && systemctl --user daemon-reload'
echo "Deployed to $HOST:~/minutesmap-poller"
