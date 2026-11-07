# Pi poller

Runs the whole NBA ingest pipeline on the Raspberry Pi instead of the `NBAGamePoller` Lambda.
`run_poller.py` imports `functions/nba-game-poller/lambda_function.py` unchanged and swaps only
its Lambda-specific orchestration for an in-process loop:

| Lambda | Pi |
|---|---|
| `NBADailyManager` rule at 11:00 UTC | manager at start-up and 11:00 UTC daily |
| one-time pre-tip / late reconcile schedules | reconcile every hour (past 4 days to next 7) |
| full-season schedule sweep after the daily manager | same, at start-up and 11:00 UTC daily |
| kickoff schedule + `NBAGamePollerRule` + half-minute schedules | poll every 30 s from first tip until all games are final |
| async self-invoke for captions | caption worker in a background thread |
| NBA feeds read from the relay's S3 mirror | NBA feeds fetched with curl (`NBA_FETCH_MODE=curl`) |

Processed output goes to the same S3 keys, so the site, WebSocket updates (S3 event
triggers) and revalidation work the same. No raw feeds are uploaded, which avoids the
relay's S3 request costs.

## Modes

Exactly one mode may be active, selected by `nba_poller_mode` in `terraform/variables.tf`:

- **`lambda`** (default): the Lambda runs; the Pi runs `minutesmap-relay` (see `relay/README.md`).
- **`pi`**: `NBADailyManager` is disabled and the Lambda exits immediately on any invocation
  (`POLLER_DISABLED=true`); the Pi runs `minutesmap-poller`.

The two Pi services declare `Conflicts=` on each other, so starting one stops the other.

## Deploys

`pi/deploy.sh` deploys from git: it fast-forwards the Pi's checkout to `origin/main` and copies the
poller from there, so only pushed commits go live. `minutesmap-autodeploy.timer` runs
`pi/auto_deploy.sh` every minute: when `origin/main` changes the poller or its Pi files, it deploys
and restarts the service as soon as CI ("Backend & Infra", for changes under `functions/`) has
passed, including during games (a restart pauses polling for about 15 seconds).

## Monitoring

The runner publishes a heartbeat to CloudWatch every minute, and `pi/setup_alerts.sh` creates email
alarms for a stopped Pi (within an hour, or 3 minutes during games) and for NBA feed errors. Everything
stays inside CloudWatch's and SNS's always-free tiers.

Setup, credentials, switching modes and day-to-day commands are in the private operations notes
(`private/OPS.md`, not in this repo).

## Tests

```bash
source functions/.venv/bin/activate && (cd pi && python -m pytest -q)
```
