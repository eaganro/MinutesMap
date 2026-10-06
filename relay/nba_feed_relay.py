#!/usr/bin/env python3
"""Mirror NBA CDN feeds into S3 for the AWS poller.

Since June 2026 cdn.nba.com rejects requests from AWS (and from Python's TLS stack),
so this runs on a residential host and fetches with curl. The NBAGamePoller Lambda
reads the mirrored copies (NBA_FEED_MIRROR_PREFIX) instead of the CDN.

Mirrored keys keep the CDN path: <prefix><path under /static/json/>.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
import time
from datetime import datetime, timezone

import boto3

CDN_JSON_ROOT = "https://cdn.nba.com/static/json/"
SCHEDULE_PATH = "staticData/scheduleLeagueV2_1.json"
SCOREBOARD_PATH = "liveData/scoreboard/todaysScoreboard_00.json"
STATUS_KEY = "_relay_status.json"

TICK_SECONDS = 30  # live game cadence
IDLE_SCOREBOARD_SECONDS = 600  # scoreboard cadence with no game near
SCHEDULE_SECONDS = 3 * 3600
SCHEDULE_RETRY_SECONDS = 600
PREGAME_SECONDS = 30 * 60  # start live cadence this long before tip
FINAL_GRACE_SECONDS = 20 * 60  # keep mirroring after a game goes final for stat corrections
STATUS_SECONDS = 600

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
}


def log(message):
    print(f"{datetime.now().strftime('%H:%M:%S')} {message}", flush=True)


def fetch_with_curl(url, etag=None, timeout=15):
    """Returns (http_status, body_bytes, etag). Status 0 means curl itself failed."""
    with tempfile.NamedTemporaryFile() as body:
        cmd = ["curl", "-s", "--compressed", "--max-time", str(timeout),
               "-o", body.name, "-D", "-", "-w", "%{http_code}"]
        for name, value in HEADERS.items():
            cmd += ["-H", f"{name}: {value}"]
        if etag:
            cmd += ["-H", f"If-None-Match: {etag}"]
        try:
            result = subprocess.run(cmd + [url], capture_output=True, text=True, timeout=timeout + 5)
        except subprocess.TimeoutExpired:
            return 0, b"", etag
        headers, _, code = result.stdout.rpartition("\n")
        new_etag = etag
        for line in headers.splitlines():
            name, _, value = line.partition(":")
            if name.strip().lower() == "etag":
                new_etag = value.strip()
        body.seek(0)
        return int(code) if code.isdigit() else 0, body.read(), new_etag


def parse_utc(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


class Relay:
    def __init__(self, s3_client, bucket, prefix, fetch=fetch_with_curl):
        self.s3 = s3_client
        self.bucket = bucket
        self.prefix = prefix
        self.fetch = fetch
        self.etags = {}
        self.hashes = {}
        self.scoreboard_games = []
        self.final_seen = {}
        self.next_schedule_at = 0
        self.next_scoreboard_at = 0
        self.next_status_at = 0
        self.last_upload_at = None

    def mirror(self, path):
        """Fetch one feed and upload it if it changed. Returns parsed JSON on a 200, else None."""
        status, body, etag = self.fetch(CDN_JSON_ROOT + path, self.etags.get(path))
        if status == 304:
            return None
        if status != 200:
            log(f"{path}: HTTP {status}")
            return None
        try:
            data = json.loads(body)
        except ValueError:
            log(f"{path}: response was not JSON (blocked?)")
            return None
        digest = hashlib.sha256(body).hexdigest()
        if self.hashes.get(path) != digest:
            self.s3.put_object(Bucket=self.bucket, Key=self.prefix + path, Body=body,
                               ContentType="application/json", CacheControl="no-cache")
            self.hashes[path] = digest
            self.last_upload_at = time.time()
        # Only remember the ETag once uploaded, so a failed upload is refetched next tick.
        self.etags[path] = etag
        return data

    def active_game_ids(self, now):
        active = []
        for game in self.scoreboard_games:
            game_id = str(game.get("gameId") or "")
            status = game.get("gameStatus")
            if not game_id:
                continue
            if status == 3:
                self.final_seen.setdefault(game_id, now)
                if now - self.final_seen[game_id] < FINAL_GRACE_SECONDS:
                    active.append(game_id)
            elif status == 2:
                active.append(game_id)
            else:
                tip = parse_utc(game.get("gameTimeUTC"))
                if tip is not None and tip <= now:
                    active.append(game_id)
        return active

    def game_near(self, now):
        for game in self.scoreboard_games:
            tip = parse_utc(game.get("gameTimeUTC"))
            if game.get("gameStatus") == 1 and tip is not None and tip - now <= PREGAME_SECONDS:
                return True
        return False

    def tick(self, now=None):
        now = time.time() if now is None else now
        if now >= self.next_schedule_at:
            ok = self.mirror(SCHEDULE_PATH) is not None or SCHEDULE_PATH in self.etags
            self.next_schedule_at = now + (SCHEDULE_SECONDS if ok else SCHEDULE_RETRY_SECONDS)

        if now >= self.next_scoreboard_at:
            scoreboard = self.mirror(SCOREBOARD_PATH)
            if scoreboard is not None:
                self.scoreboard_games = (scoreboard.get("scoreboard") or {}).get("games") or []

        active = self.active_game_ids(now)
        for game_id in active:
            self.mirror(f"liveData/boxscore/boxscore_{game_id}.json")
            self.mirror(f"liveData/playbyplay/playbyplay_{game_id}.json")

        if now >= self.next_scoreboard_at:
            busy = bool(active) or self.game_near(now)
            self.next_scoreboard_at = now + (TICK_SECONDS if busy else IDLE_SCOREBOARD_SECONDS)

        if now >= self.next_status_at:
            self.write_status(now, active)
            self.next_status_at = now + STATUS_SECONDS
        return active

    def write_status(self, now, active):
        status = {
            "updatedAt": datetime.fromtimestamp(now, timezone.utc).isoformat(),
            "lastUploadAt": (datetime.fromtimestamp(self.last_upload_at, timezone.utc).isoformat()
                             if self.last_upload_at else None),
            "activeGames": active,
        }
        self.s3.put_object(Bucket=self.bucket, Key=self.prefix + STATUS_KEY, Body=json.dumps(status),
                           ContentType="application/json", CacheControl="no-cache")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--prefix", default="private/nba-feed/")
    parser.add_argument("--profile", default=None, help="AWS credentials profile")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--once", action="store_true", help="run a single tick and exit")
    args = parser.parse_args()

    s3 = boto3.Session(profile_name=args.profile, region_name=args.region).client("s3")
    relay = Relay(s3, args.bucket, args.prefix)
    log(f"Mirroring cdn.nba.com feeds to s3://{args.bucket}/{args.prefix}")
    while True:
        started = time.time()
        try:
            active = relay.tick(started)
            if active:
                log(f"active games: {', '.join(active)}")
        except Exception as exc:  # keep relaying through transient S3/network errors
            log(f"tick failed: {exc!r}")
        if args.once:
            return
        time.sleep(max(1.0, TICK_SECONDS - (time.time() - started)))


if __name__ == "__main__":
    main()
