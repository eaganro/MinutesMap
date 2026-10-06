# NBA feed relay

Since June 2026 `cdn.nba.com/static/json/*` returns an Akamai 403 to AWS addresses and to
Python's TLS stack, so `NBAGamePoller` can no longer fetch NBA feeds itself. This relay runs on
a residential host (the Raspberry Pi) and mirrors the feeds into S3 with `curl`:

| Feed | Cadence |
|---|---|
| `staticData/scheduleLeagueV2_1.json` | every 3 hours (retry after 10 min on failure) |
| `liveData/scoreboard/todaysScoreboard_00.json` | 30 s from 30 min before a tip until games end, otherwise 10 min |
| `liveData/boxscore/boxscore_<id>.json`, `liveData/playbyplay/playbyplay_<id>.json` | 30 s while live and for 20 min after final |

Objects are written to `s3://roryeagan.com-nba-processed-data/private/nba-feed/<path under /static/json/>`,
only when the content changes. `private/nba-feed/_relay_status.json` is a heartbeat updated every 10 minutes.
The poller reads the mirror when `NBA_FEED_MIRROR_PREFIX` is set (see `terraform/fn_game_poller.tf`)
and logs `Mirror: ... is stale` when an object is more than 6 hours old.

## Credentials

The relay uses IAM user `minutesmap-nba-relay`, which can only `s3:PutObject` under `private/nba-feed/*`.
It is managed outside Terraform because the GitHub deploy role cannot manage IAM users. Its access key is
stored on the Pi as the `minutesmap-relay` profile in `~/.aws/credentials`.

## Install / update on the Pi

```bash
ssh raspberrypi 'mkdir -p ~/minutesmap-relay ~/.config/systemd/user'
scp relay/nba_feed_relay.py raspberrypi:minutesmap-relay/
scp relay/minutesmap-relay.service raspberrypi:.config/systemd/user/
ssh raspberrypi 'cd ~/minutesmap-relay && { [ -d .venv ] || python3 -m venv .venv; } && .venv/bin/pip install -q boto3'
ssh raspberrypi 'systemctl --user daemon-reload && systemctl --user enable --now minutesmap-relay'
```

Status and recent logs: `ssh raspberrypi systemctl --user status minutesmap-relay` (the Pi has no
persistent user journal, so `journalctl --user` shows nothing). The S3 heartbeat is
`aws s3 cp s3://roryeagan.com-nba-processed-data/private/nba-feed/_relay_status.json -`.

## Tests

```bash
source functions/.venv/bin/activate && python -m pytest -q relay/test_nba_feed_relay.py
```
