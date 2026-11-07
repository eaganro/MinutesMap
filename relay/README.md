# NBA feed relay

This relay runs on the Raspberry Pi and mirrors NBA's JSON feeds into S3 with `curl`, for
`NBAGamePoller` to read:

| Feed | Cadence |
|---|---|
| `staticData/scheduleLeagueV2_1.json` | every 3 hours (retry after 10 min on failure) |
| `liveData/scoreboard/todaysScoreboard_00.json` | 30 s from 30 min before a tip until games end, otherwise 10 min |
| `liveData/boxscore/boxscore_<id>.json`, `liveData/playbyplay/playbyplay_<id>.json` | 30 s while live and for 20 min after final |

Objects are written under `private/nba-feed/<path under /static/json/>` in the processed-data bucket,
only when the content changes. `private/nba-feed/_relay_status.json` is a heartbeat updated every 10 minutes.
The poller reads the mirror when `NBA_FEED_MIRROR_PREFIX` is set (see `terraform/fn_game_poller.tf`)
and logs `Mirror: ... is stale` when an object is more than 6 hours old.

The relay writes with a dedicated IAM user that can only `s3:PutObject` under `private/nba-feed/*`.
Installing it, its credentials and status checks are in the private operations notes (`private/OPS.md`,
not in this repo).

## Tests

```bash
source functions/.venv/bin/activate && python -m pytest -q relay/test_nba_feed_relay.py
```
