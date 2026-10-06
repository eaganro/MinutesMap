#!/usr/bin/env python3
"""Run the NBAGamePoller pipeline on the Pi instead of AWS Lambda.

Imports functions/nba-game-poller/lambda_function.py unchanged and replaces only its
Lambda-specific orchestration (EventBridge rules, one-time schedules, async caption
invocations) with an in-process loop. Feeds are fetched from cdn.nba.com with curl and
processed output is written straight to S3, so no raw feeds are mirrored.

Only one pipeline may be active: switch the Lambda off (terraform nba_poller_mode = "pi")
before starting this. See pi/README.md.
"""
import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

TICK_SECONDS = 30  # same cadence as the Lambda poller (1-minute rule plus half-minute schedule)
RECONCILE_SECONDS = 3600
MANAGER_HOUR_UTC = 11  # the Lambda's NBADailyManager runs cron(0 11 * * ? *)

DEFAULT_POLLER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nba-game-poller")
REPO_POLLER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "functions", "nba-game-poller")


def log(message):
    print(f"{datetime.now().strftime('%H:%M:%S')} {message}", flush=True)


def next_manager_time(now):
    current = datetime.fromtimestamp(now, timezone.utc)
    run = current.replace(hour=MANAGER_HOUR_UTC, minute=0, second=0, microsecond=0)
    if run <= current:
        run += timedelta(days=1)
    return run.timestamp()


def load_poller(poller_dir, bucket):
    os.environ["DATA_BUCKET"] = bucket
    os.environ["NBA_FETCH_MODE"] = "curl"
    # Required by the module at import; the runner replaces everything that would use it.
    os.environ.setdefault("POLLER_RULE_NAME", "pi-runner")
    for name in ("NBA_FEED_MIRROR_PREFIX", "POLLER_DISABLED", "LAMBDA_ARN", "SCHEDULER_ROLE_ARN"):
        os.environ.pop(name, None)
    sys.path.insert(0, poller_dir)
    import lambda_function
    return lambda_function


class PiRunner:
    def __init__(self, poller, caption_executor=None):
        self.poller = poller
        self.polling = False
        self.kickoff_at = None
        self.next_manager_at = 0  # run the manager at start-up
        self.next_reconcile_at = 0
        self.captions = caption_executor or ThreadPoolExecutor(max_workers=1)

        poller.enable_poller_logic = self.enable
        poller.disable_self = self.disable
        poller.schedule_kickoff = self.schedule_kickoff
        poller.schedule_half_poller = lambda: False
        # The Lambda adds reconciles 15 min before each tip; the hourly reconcile covers that here.
        poller.schedule_reconcile_for_games = lambda games, **kwargs: None
        poller.enqueue_caption_worker = self.enqueue_caption

    def enable(self):
        if not self.polling:
            log("Polling enabled.")
        self.polling = True
        self.kickoff_at = None

    def disable(self):
        if self.polling:
            log("Polling disabled.")
        self.polling = False

    def schedule_kickoff(self, run_at_dt):
        self.kickoff_at = run_at_dt.timestamp()
        log(f"Kickoff scheduled for {run_at_dt.isoformat()}.")
        return True

    def enqueue_caption(self, *, game_key, latest_closed_period, status_text=""):
        payload = {
            "task": "caption_worker",
            "gameKey": game_key,
            "closedThrough": latest_closed_period,
            "status": status_text or "",
        }
        self.captions.submit(self._run_caption, payload)
        return True

    def _run_caption(self, payload):
        try:
            self.poller.caption_worker_logic(payload)
        except Exception as exc:
            log(f"Caption worker failed for {payload['gameKey']}: {exc!r}")

    def tick(self, now=None):
        now = time.time() if now is None else now
        if now >= self.next_manager_at:
            self._step("manager", self.poller.manager_logic)
            self.next_manager_at = next_manager_time(now)
            self.next_reconcile_at = now + RECONCILE_SECONDS
        elif now >= self.next_reconcile_at:
            self._step("reconcile", self.poller.reconcile_recent_schedule)
            self.next_reconcile_at = now + RECONCILE_SECONDS

        if self.kickoff_at is not None and now >= self.kickoff_at:
            self.enable()
        if self.polling:
            self._step("poller", lambda: self.poller.poller_logic(None, schedule_half=False))

    def _step(self, name, fn):
        try:
            fn()
        except Exception as exc:  # keep the loop alive; the next tick retries
            log(f"{name} failed: {exc!r}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", default="roryeagan.com-nba-processed-data")
    parser.add_argument("--poller-dir", default=None, help="directory containing lambda_function.py")
    parser.add_argument("--once", action="store_true", help="run a single tick and exit")
    args = parser.parse_args()

    poller_dir = args.poller_dir or (DEFAULT_POLLER_DIR if os.path.isdir(DEFAULT_POLLER_DIR) else REPO_POLLER_DIR)
    runner = PiRunner(load_poller(poller_dir, args.bucket))
    log(f"Running the NBA poller pipeline from {poller_dir} against s3://{args.bucket}")
    while True:
        started = time.time()
        runner.tick(started)
        if args.once:
            runner.captions.shutdown(wait=True)
            return
        time.sleep(max(1.0, TICK_SECONDS - (time.time() - started)))


if __name__ == "__main__":
    main()
