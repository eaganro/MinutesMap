# Pi poller

Runs the whole NBA ingest pipeline on the Raspberry Pi instead of the `NBAGamePoller` Lambda.
`run_poller.py` imports `functions/nba-game-poller/lambda_function.py` unchanged and swaps only
its Lambda-specific orchestration for an in-process loop:

| Lambda | Pi |
|---|---|
| `NBADailyManager` rule at 11:00 UTC | manager at start-up and 11:00 UTC daily |
| one-time pre-tip / late reconcile schedules | reconcile every hour |
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

### Switch Lambda → Pi

1. Set `nba_poller_mode` default to `"pi"`, push to `main`, and wait for the Backend & Infra workflow.
2. `ssh raspberrypi 'systemctl --user enable --now minutesmap-poller && systemctl --user disable minutesmap-relay'`

### Switch Pi → Lambda

1. `ssh raspberrypi 'systemctl --user disable --now minutesmap-poller && systemctl --user enable --now minutesmap-relay'`
2. Set `nba_poller_mode` default to `"lambda"`, push to `main`, wait for the workflow, then invoke
   the manager once: `aws lambda invoke --function-name NBAGamePoller --cli-binary-format raw-in-base64-out --payload '{"task":"manager"}' /dev/null`

## One-time setup

1. IAM: the Pi uses IAM user `minutesmap-nba-relay` (profile `minutesmap-relay`), managed outside
   Terraform. Pi mode needs its `minutesmap-poller` inline policy: Get/Put on `data/*`, `schedule/*`,
   `private/gameIdMap/*` and prefix-limited ListBucket — the same S3 access as the Lambda role.
2. Secrets: `~/minutesmap-poller/secrets.env` (mode 600) with `GEMINI_API_KEY` and
   `MINUTESMAP_REVALIDATE_SECRET` (copied from the Lambda's configuration) and `OPENAI_API_KEY`
   (copied from `~/.config/wnba-pilot/credentials.env`, the nba-market-research key). The Pi
   captions with OpenAI `gpt-6-luna` (`CAPTION_PROVIDER=openai`); the Lambda still uses Gemini.
3. Code: push to `main`, then `bash pi/deploy.sh` (re-run after any change to the poller or runner,
   then `ssh raspberrypi systemctl --user restart minutesmap-poller` if it is running). It deploys
   from git: it fast-forwards the Pi's `~/MinutesMap` checkout to `origin/main` and copies the
   poller from there into `~/minutesmap-poller`, so only pushed commits go live, and edits in the
   checkout don't reach the service until the next deploy. `~/minutesmap-poller/DEPLOYED` holds
   the deployed commit. On the Pi itself, run `bash pi/deploy.sh` from `~/MinutesMap`.

Status and recent logs: `ssh raspberrypi systemctl --user status minutesmap-poller`.
Deployed commit: `ssh raspberrypi cat minutesmap-poller/DEPLOYED`.

## Tests

```bash
source functions/.venv/bin/activate && (cd pi && python -m pytest -q)
```
