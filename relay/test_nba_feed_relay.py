import json

import boto3
import pytest
from moto import mock_aws

import nba_feed_relay as relay_mod
from nba_feed_relay import CDN_JSON_ROOT, SCHEDULE_PATH, SCOREBOARD_PATH, Relay

BUCKET = "test-bucket"
PREFIX = "private/nba-feed/"
NOW = 1_791_250_000  # 2026-10-05 ~22:13 ET
BOX = "liveData/boxscore/boxscore_{}.json"
PBP = "liveData/playbyplay/playbyplay_{}.json"


def iso(ts):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class FakeCdn:
    def __init__(self):
        self.feeds = {}
        self.calls = []

    def set(self, path, payload):
        self.feeds[path] = json.dumps(payload).encode()

    def __call__(self, url, etag=None):
        path = url[len(CDN_JSON_ROOT):]
        self.calls.append(path)
        body = self.feeds.get(path)
        if body is None:
            return 403, b"<html>Access Denied</html>", etag
        tag = f'"{hash(body)}"'
        if etag == tag:
            return 304, b"", etag
        return 200, body, tag


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        yield client


def scoreboard(*games):
    return {"scoreboard": {"games": list(games)}}


def stored(s3, path):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=PREFIX + path)["Body"].read())


def test_mirrors_schedule_scoreboard_and_live_games(s3):
    cdn = FakeCdn()
    cdn.set(SCHEDULE_PATH, {"leagueSchedule": {"gameDates": []}})
    cdn.set(SCOREBOARD_PATH, scoreboard(
        {"gameId": "0012600024", "gameStatus": 2, "gameTimeUTC": iso(NOW - 3600)},
        {"gameId": "0012600030", "gameStatus": 1, "gameTimeUTC": iso(NOW + 7200)},
    ))
    cdn.set(BOX.format("0012600024"), {"game": {"gameStatus": 2}})
    cdn.set(PBP.format("0012600024"), {"game": {"actions": []}})

    relay = Relay(s3, BUCKET, PREFIX, fetch=cdn)
    assert relay.tick(NOW) == ["0012600024"]

    assert stored(s3, SCHEDULE_PATH) == {"leagueSchedule": {"gameDates": []}}
    assert stored(s3, BOX.format("0012600024")) == {"game": {"gameStatus": 2}}
    assert stored(s3, PBP.format("0012600024")) == {"game": {"actions": []}}
    assert relay.next_scoreboard_at == NOW + relay_mod.TICK_SECONDS
    assert relay.next_schedule_at == NOW + relay_mod.SCHEDULE_SECONDS
    assert "activeGames" in stored(s3, relay_mod.STATUS_KEY)


def test_idle_day_polls_scoreboard_slowly(s3):
    cdn = FakeCdn()
    cdn.set(SCHEDULE_PATH, {})
    cdn.set(SCOREBOARD_PATH, scoreboard({"gameId": "1", "gameStatus": 1, "gameTimeUTC": iso(NOW + 5 * 3600)}))
    relay = Relay(s3, BUCKET, PREFIX, fetch=cdn)
    assert relay.tick(NOW) == []
    assert relay.next_scoreboard_at == NOW + relay_mod.IDLE_SCOREBOARD_SECONDS


def test_pregame_window_switches_to_live_cadence(s3):
    cdn = FakeCdn()
    cdn.set(SCHEDULE_PATH, {})
    cdn.set(SCOREBOARD_PATH, scoreboard({"gameId": "1", "gameStatus": 1, "gameTimeUTC": iso(NOW + 600)}))
    relay = Relay(s3, BUCKET, PREFIX, fetch=cdn)
    assert relay.tick(NOW) == []
    assert relay.next_scoreboard_at == NOW + relay_mod.TICK_SECONDS


def test_final_games_mirror_for_grace_period_then_stop(s3):
    cdn = FakeCdn()
    cdn.set(SCHEDULE_PATH, {})
    cdn.set(SCOREBOARD_PATH, scoreboard({"gameId": "9", "gameStatus": 3, "gameTimeUTC": iso(NOW - 9000)}))
    cdn.set(BOX.format("9"), {"final": True})
    cdn.set(PBP.format("9"), {"final": True})
    relay = Relay(s3, BUCKET, PREFIX, fetch=cdn)
    assert relay.tick(NOW) == ["9"]
    assert stored(s3, BOX.format("9")) == {"final": True}
    assert relay.tick(NOW + relay_mod.FINAL_GRACE_SECONDS + 1) == []


def test_blocked_or_unchanged_feeds_are_not_uploaded_again(s3):
    cdn = FakeCdn()
    cdn.set(SCOREBOARD_PATH, scoreboard())
    relay = Relay(s3, BUCKET, PREFIX, fetch=cdn)
    relay.tick(NOW)  # schedule missing -> 403 HTML
    assert relay.next_schedule_at == NOW + relay_mod.SCHEDULE_RETRY_SECONDS
    with pytest.raises(s3.exceptions.NoSuchKey):
        s3.get_object(Bucket=BUCKET, Key=PREFIX + SCHEDULE_PATH)

    puts = []
    relay.s3 = type("Spy", (), {"put_object": lambda self, **kw: puts.append(kw["Key"])})()
    relay.next_scoreboard_at = 0
    relay.tick(NOW + 60)  # scoreboard answers 304
    assert PREFIX + SCOREBOARD_PATH not in puts


def test_failed_upload_is_retried(s3):
    cdn = FakeCdn()
    cdn.set(SCHEDULE_PATH, {"v": 1})
    relay = Relay(s3, BUCKET, PREFIX, fetch=cdn)

    class Failing:
        def put_object(self, **kw):
            raise RuntimeError("S3 down")

    relay.s3 = Failing()
    with pytest.raises(RuntimeError):
        relay.mirror(SCHEDULE_PATH)
    relay.s3 = s3
    assert relay.mirror(SCHEDULE_PATH) == {"v": 1}
    assert stored(s3, SCHEDULE_PATH) == {"v": 1}
