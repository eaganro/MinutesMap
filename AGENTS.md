# AGENTS.md

Repository instructions for coding agents working in this project.

## Repository map
- `front/`: Vite + React client, Playwright E2E tests, static-page build script.
- `functions/`: AWS Lambda code (Python + TypeScript), pytest + vitest tests.
- `jobs/`: Utility/backfill scripts (Node + Python) that can read/write AWS data.
- `terraform/`: AWS infrastructure definitions and deployment wiring.

## General rules
- Keep changes focused and minimal.
- Prefer targeted tests for changed areas before broad suites.
- Do not commit secrets, private endpoints, or credentials.
- Do not revert unrelated local changes.
- Use `rg`/`rg --files` for fast code search.

## Local environment
- Node.js 20+ (matches CI).
- Python 3.11+ for Lambda Python tests.
- Terraform 1.x for infra validation.
- Use the project virtual environment for Python in `functions/`:
  - `source functions/.venv/bin/activate`
- Prefer module execution style for Python:
  - `python -m pytest ...`
  - `python -m py_compile ...`

## Install commands
- Frontend deps: `npm --prefix front ci`
- Lambda TS deps: `npm --prefix functions ci`
- Jobs deps: `npm --prefix jobs ci`
- Python test deps (in venv): `source functions/.venv/bin/activate && python -m pip install -r functions/requirements-dev.txt`

## Change-to-test mapping
Run the smallest relevant checks first.

- Python Lambda changes (`functions/**/*.py`):
  - `source functions/.venv/bin/activate && python -m pytest -q functions/tests/<test_file>.py`
- Poller package changes (`functions/nba-game-poller/**`):
  - `source functions/.venv/bin/activate && python -m pytest -q functions/tests/test_nba_game_poller_processing.py`
  - `source functions/.venv/bin/activate && python -m pytest -q functions/tests/test_nba_game_poller_helpers.py`
  - `source functions/.venv/bin/activate && python -m pytest -q functions/tests/test_nba_game_poller_lambda.py`
- TypeScript Lambda/shared changes (`functions/**/*.ts`):
  - `npm --prefix functions run test -- tests/<file>.test.ts`
- Frontend UI/behavior changes (`front/src/**`):
  - `npm --prefix front test -- --list` (quick sanity on test discovery)
  - `npm --prefix front test -- e2e/app.spec.js --project=chromium -g "<pattern>"`
- Infra changes (`terraform/**`):
  - `terraform -chdir=terraform fmt <touched_file>.tf` (target only changed files)
  - `terraform -chdir=terraform validate` (run when local provider plugins are available; otherwise note skip and rely on CI)

## Build commands
- Frontend production build (local): `npm --prefix front run build`
- Rebuild TypeScript Lambda bundles: `npm --prefix functions run build:lambdas`

## Generated artifacts
- Do not hand-edit generated Lambda bundle files:
  - `functions/gameDateUpdates/lambda_function.js`
  - `functions/ws-sendGameUpdate-handler/lambda_function.js`
- If their `.ts` sources change, regenerate with:
  - `npm --prefix functions run build:lambdas`

## Environment variables and config
- Frontend local env template: `front/.env.example`
  - `VITE_WS_LOCATION`
  - `VITE_PREFIX`
  - `VITE_ASSET_PREFIX`
- Python/AWS scripts often default to `us-east-1`; check script args before overriding.

## High-risk commands (explicit confirmation required)
These can modify production infra/data or trigger deploys. Do not run automatically.

- `terraform -chdir=terraform apply` (or any non-read-only terraform apply/destroy/import/state command)
- `npm --prefix front run build:prod:upload`
- `npm --prefix front run sync:static`
- `npm --prefix front run sync:index`
- Jobs/scripts that write to AWS resources (S3, DynamoDB, CloudFront invalidation), including:
  - `jobs/pollingGetData.js`
  - `jobs/getFullSchedule.js`
  - `jobs/backfill_gamepack.py` with upload options
  - `jobs/process_gameid.py --upload`

## Git hygiene
- Keep commit messages neutral and low-key.
- Include only files relevant to the task.
- In final handoff, list:
  - Files changed
  - Commands/tests run
  - Any commands intentionally not run
