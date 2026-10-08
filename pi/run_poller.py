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
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

TICK_SECONDS = 30  # same cadence as the Lambda poller (1-minute rule plus half-minute schedule)
RECONCILE_SECONDS = 3600
MANAGER_HOUR_UTC = 11  # the Lambda's NBADailyManager runs cron(0 11 * * ? *)
READY_HOSTS = ("cdn.nba.com", "s3.us-east-1.amazonaws.com")
TIME_SYNC_MARKER = "/run/systemd/timesync/synchronized"  # created by systemd-timesyncd
HEARTBEAT_SECONDS = 60
GAME_WINDOW_MARGIN_SECONDS = 3600  # tighten alerting this long before the first tip
METRIC_NAMESPACE = "MinutesMap/PiPoller"  # alarms: pi/setup_alerts.sh
GAME_TIME_ALARM = "MinutesMap-Pi-Down-GameTime"
# Small and always present, unlike a game's feeds, which return 403 until shortly before tip.
SCOREBOARD_URL = "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json"

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


def network_and_clock_ready(hosts=READY_HOSTS, marker=TIME_SYNC_MARKER):
    if os.path.isdir(os.path.dirname(marker)) and not os.path.exists(marker):
        return False
    for host in hosts:
        try:
            socket.create_connection((host, 443), timeout=5).close()
        except OSError:
            return False
    return True


def wait_until_ready(check=network_and_clock_ready, sleep=time.sleep, interval=15):
    """After a power cut the service can start before Wi-Fi and NTP; the manager would
    then find no games and nothing would poll until the next day's run."""
    waited = 0
    while not check():
        if waited % 120 == 0:
            log("Waiting for network and clock sync...")
        sleep(interval)
        waited += interval
    if waited:
        log(f"Network and clock ready after {waited}s.")


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


class Heartbeat:
    """Publishes a CloudWatch heartbeat every minute for the alarms in pi/setup_alerts.sh, which
    email when it stops. The game-time alarm (a few minutes of silence) is only armed in the game
    window; the always-on alarm waits an hour. In the window it also reports how many checks of the
    NBA scoreboard feed in a row were refused, which catches the NBA blocking the Pi."""

    def __init__(self, cloudwatch, probe):
        self.cloudwatch = cloudwatch
        self.probe = probe
        self.game_alarm_armed = None  # unknown at start-up
        self.next_at = 0
        self.feed_refusals = 0

    def update(self, now, in_game_window):
        if self.game_alarm_armed != in_game_window:
            toggle = self.cloudwatch.enable_alarm_actions if in_game_window else self.cloudwatch.disable_alarm_actions
            try:
                toggle(AlarmNames=[GAME_TIME_ALARM])
                self.game_alarm_armed = in_game_window
                log(f"Game-time alarm {'armed' if in_game_window else 'disarmed'}.")
            except Exception as exc:
                log(f"Game-time alarm update failed: {exc!r}")
        if now < self.next_at:
            return
        self.next_at = now + HEARTBEAT_SECONDS
        metrics = [{"MetricName": "Heartbeat", "Value": 1, "Unit": "Count"}]
        if in_game_window:
            try:
                feed_ok = self.probe()
            except Exception:
                feed_ok = False
            self.feed_refusals = 0 if feed_ok else self.feed_refusals + 1
            if not feed_ok:
                log(f"NBA scoreboard check refused ({self.feed_refusals} in a row).")
            metrics.append({"MetricName": "NbaFeedRefused", "Value": self.feed_refusals, "Unit": "Count"})
        else:
            self.feed_refusals = 0
        try:
            self.cloudwatch.put_metric_data(Namespace=METRIC_NAMESPACE, MetricData=metrics)
        except Exception as exc:
            log(f"Heartbeat failed: {exc!r}")


class PiRunner:
    def __init__(self, poller, caption_executor=None):
        self.poller = poller
        self.polling = False
        self.kickoff_at = None
        self.done_date = None  # NBA date whose games all finished
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
        self.done_date = self.poller.get_nba_date()

    def schedule_kickoff(self, run_at_dt):
        self.kickoff_at = run_at_dt.timestamp()
        log(f"Kickoff scheduled for {run_at_dt.isoformat()}.")
        return True

    def enqueue_caption(self, *, game_key, latest_closed_period, status_text="", flow_payload=None, box_payload=None):
        payload = {
            "task": "caption_worker",
            "gameKey": game_key,
            "closedThrough": latest_closed_period,
            "status": status_text or "",
        }
        # The worker starts before this poll uploads the gamepack, so hand it the fresh data.
        if isinstance(flow_payload, dict):
            payload["flow"] = flow_payload
        if isinstance(box_payload, dict):
            payload["box"] = box_payload
        self.captions.submit(self._run_caption, payload)
        return True

    def _run_caption(self, payload):
        try:
            self.poller.caption_worker_logic(payload)
        except Exception as exc:
            log(f"Caption worker failed for {payload['gameKey']}: {exc!r}")

    def in_game_window(self, now):
        if self.polling:
            return True
        return self.kickoff_at is not None and now >= self.kickoff_at - GAME_WINDOW_MARGIN_SECONDS

    def scoreboard_reachable(self):
        data, _ = self.poller.fetch_nba_data(SCOREBOARD_URL)
        return data is not None

    def tick(self, now=None):
        now = time.time() if now is None else now
        if now >= self.next_manager_at:
            self._step("manager", self.poller.manager_logic)
            self.next_manager_at = next_manager_time(now)
            self.next_reconcile_at = now + RECONCILE_SECONDS
        elif now >= self.next_reconcile_at:
            if self.polling or self.kickoff_at is not None or self.done_date == self.poller.get_nba_date():
                self._step("reconcile", self.poller.reconcile_recent_schedule)
            else:
                # Nothing polling or scheduled yet today: rerun the manager in case an earlier
                # run missed games (feed or S3 outage) or games were added since.
                self._step("manager", self.poller.manager_logic)
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
    wait_until_ready()
    runner = PiRunner(load_poller(poller_dir, args.bucket))
    heartbeat = None
    if os.environ.get("CLOUDWATCH_HEARTBEAT") == "true":
        import boto3
        heartbeat = Heartbeat(boto3.client("cloudwatch"), runner.scoreboard_reachable)
    log(f"Running the NBA poller pipeline from {poller_dir} against s3://{args.bucket}")
    while True:
        started = time.time()
        runner.tick(started)
        if heartbeat:
            now = time.time()
            heartbeat.update(now, runner.in_game_window(now))
        if args.once:
            runner.captions.shutdown(wait=True)
            return
        time.sleep(max(1.0, TICK_SECONDS - (time.time() - started)))


if __name__ == "__main__":
    main()
