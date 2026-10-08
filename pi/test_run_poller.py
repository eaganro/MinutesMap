from datetime import datetime, timezone
from types import SimpleNamespace

import run_poller
from run_poller import PiRunner, next_manager_time

NOW = datetime(2026, 10, 6, 15, 0, tzinfo=timezone.utc).timestamp()  # 11:00 ET


class InlineExecutor:
    def submit(self, fn, *args):
        fn(*args)


def fake_poller(**overrides):
    calls = []
    poller = SimpleNamespace(calls=calls)
    poller.manager_logic = lambda: calls.append("manager")
    poller.reconcile_recent_schedule = lambda: calls.append("reconcile")
    poller.poller_logic = lambda context, schedule_half=True: calls.append(("poll", context, schedule_half))
    poller.caption_worker_logic = lambda event: calls.append(("caption", event))
    poller.get_nba_date = lambda: "2026-10-06"
    for name, value in overrides.items():
        setattr(poller, name, value)
    return poller


def test_manager_runs_at_start_and_enables_polling_for_started_games():
    poller = fake_poller()
    runner = PiRunner(poller, InlineExecutor())
    poller.manager_logic = lambda: (poller.calls.append("manager"), poller.enable_poller_logic())
    runner.tick(NOW)
    assert poller.calls == ["manager", ("poll", None, False)]
    assert runner.next_manager_at == datetime(2026, 10, 7, 11, tzinfo=timezone.utc).timestamp()


def test_kickoff_waits_for_first_tip():
    poller = fake_poller()
    runner = PiRunner(poller, InlineExecutor())
    tip = datetime.fromtimestamp(NOW + 3600, timezone.utc)
    poller.manager_logic = lambda: poller.schedule_kickoff(tip)
    runner.tick(NOW)
    assert not runner.polling
    runner.tick(NOW + 3600)
    assert runner.polling and poller.calls[-1] == ("poll", None, False)


def test_poller_disabling_itself_stops_polling():
    poller = fake_poller()
    runner = PiRunner(poller, InlineExecutor())
    runner.next_manager_at = runner.next_reconcile_at = NOW + 10_000
    runner.enable()
    poller.poller_logic = lambda context, schedule_half=True: poller.disable_self()
    runner.tick(NOW)
    assert not runner.polling


def test_hourly_reconcile_once_todays_games_are_done():
    poller = fake_poller()
    runner = PiRunner(poller, InlineExecutor())
    runner.tick(NOW)
    runner.enable()
    runner.disable()  # all of today's games final
    poller.calls.clear()
    runner.tick(NOW + 1800)
    runner.tick(NOW + run_poller.RECONCILE_SECONDS)
    assert poller.calls == ["reconcile"]


def test_hourly_reconcile_while_kickoff_is_pending():
    poller = fake_poller()
    runner = PiRunner(poller, InlineExecutor())
    tip = datetime.fromtimestamp(NOW + 5 * 3600, timezone.utc)
    poller.manager_logic = lambda: (poller.calls.append("manager"), poller.schedule_kickoff(tip))
    runner.tick(NOW)
    runner.tick(NOW + run_poller.RECONCILE_SECONDS)
    assert poller.calls == ["manager", "reconcile"]


def test_manager_retries_hourly_when_nothing_was_scheduled():
    # e.g. the first run after a power cut found no schedule because S3 was unreachable
    poller = fake_poller()
    runner = PiRunner(poller, InlineExecutor())
    runner.tick(NOW)
    assert not runner.polling and runner.kickoff_at is None
    poller.manager_logic = lambda: (poller.calls.append("manager"), poller.enable_poller_logic())
    runner.tick(NOW + run_poller.RECONCILE_SECONDS)
    assert poller.calls[:3] == ["manager", "manager", ("poll", None, False)]


def test_wait_until_ready_polls_until_network_and_clock_are_up():
    results = iter([False, False, True])
    sleeps = []
    run_poller.wait_until_ready(check=lambda: next(results), sleep=sleeps.append, interval=15)
    assert sleeps == [15, 15]


def test_network_check_requires_time_sync_marker(tmp_path):
    marker = tmp_path / "timesync" / "synchronized"
    marker.parent.mkdir()
    assert not run_poller.network_and_clock_ready(hosts=(), marker=str(marker))
    marker.touch()
    assert run_poller.network_and_clock_ready(hosts=(), marker=str(marker))


def test_caption_requests_run_the_caption_worker():
    poller = fake_poller()
    PiRunner(poller, InlineExecutor())
    assert poller.enqueue_caption_worker(game_key="g", latest_closed_period=2, status_text="Half")
    assert poller.calls == [("caption", {"task": "caption_worker", "gameKey": "g",
                                          "closedThrough": 2, "status": "Half"})]


def test_caption_requests_pass_the_fresh_flow_and_box():
    poller = fake_poller()
    PiRunner(poller, InlineExecutor())
    poller.enqueue_caption_worker(game_key="g", latest_closed_period=4, status_text="Final",
                                  flow_payload={"score": []}, box_payload={"teams": {}})
    assert poller.calls[0][1]["flow"] == {"score": []}
    assert poller.calls[0][1]["box"] == {"teams": {}}


def test_failures_do_not_stop_the_loop():
    def boom():
        raise RuntimeError("feed down")

    poller = fake_poller(manager_logic=boom)
    runner = PiRunner(poller, InlineExecutor())
    runner.tick(NOW)  # no exception
    assert runner.next_manager_at > NOW


def test_next_manager_time_is_next_11_utc():
    assert next_manager_time(datetime(2026, 10, 6, 10, 59, tzinfo=timezone.utc).timestamp()) == \
        datetime(2026, 10, 6, 11, tzinfo=timezone.utc).timestamp()
    assert next_manager_time(datetime(2026, 10, 6, 11, 0, tzinfo=timezone.utc).timestamp()) == \
        datetime(2026, 10, 7, 11, tzinfo=timezone.utc).timestamp()


def test_load_poller_uses_curl_and_drops_lambda_settings(monkeypatch):
    for name, value in (("AWS_ACCESS_KEY_ID", "testing"), ("AWS_SECRET_ACCESS_KEY", "testing"),
                        ("AWS_DEFAULT_REGION", "us-east-1")):
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("NBA_FEED_MIRROR_PREFIX", "private/nba-feed/")
    monkeypatch.setenv("LAMBDA_ARN", "arn:aws:lambda:us-east-1:1:function:x")
    module = run_poller.load_poller(run_poller.REPO_POLLER_DIR, "test-bucket")
    assert module.BUCKET == "test-bucket"
    assert module.NBA_FETCH_MODE == "curl"
    assert module.NBA_FEED_MIRROR_PREFIX == ""
    assert not module.POLLER_DISABLED





class FakeCloudWatch:
    def __init__(self):
        self.calls = []

    def put_metric_data(self, Namespace, MetricData):
        assert Namespace == "MinutesMap/PiPoller"
        self.calls.append(("put", {m["MetricName"]: m["Value"] for m in MetricData}))

    def enable_alarm_actions(self, AlarmNames):
        self.calls.append(("arm", AlarmNames))

    def disable_alarm_actions(self, AlarmNames):
        self.calls.append(("disarm", AlarmNames))


def heartbeat(feed_ok=True):
    cloudwatch = FakeCloudWatch()
    return run_poller.Heartbeat(cloudwatch, probe=lambda: feed_ok), cloudwatch.calls


def test_heartbeat_publishes_every_minute():
    beat, calls = heartbeat()
    for offset in (0, 30, 59, 60):
        beat.update(NOW + offset, False)
    assert calls == [
        ("disarm", ["MinutesMap-Pi-Down-GameTime"]),
        ("put", {"Heartbeat": 1}),
        ("put", {"Heartbeat": 1}),
    ]


def test_heartbeat_arms_the_game_time_alarm_only_in_the_game_window():
    beat, calls = heartbeat()
    beat.update(NOW, False)
    beat.update(NOW + 60, True)
    beat.update(NOW + 120, True)
    beat.update(NOW + 180, False)
    assert [c[0] for c in calls] == ["disarm", "put", "arm", "put", "put", "disarm", "put"]


def test_heartbeat_retries_a_failed_alarm_update():
    beat, calls = heartbeat()
    def failing(AlarmNames):
        raise OSError("offline")
    real = beat.cloudwatch.enable_alarm_actions
    beat.cloudwatch.enable_alarm_actions = failing
    beat.update(NOW, True)
    beat.cloudwatch.enable_alarm_actions = real
    beat.update(NOW + 30, True)
    assert ("arm", ["MinutesMap-Pi-Down-GameTime"]) in calls


def test_heartbeat_counts_refused_scoreboard_checks_in_the_game_window():
    beat, calls = heartbeat(feed_ok=False)
    for minute in range(3):
        beat.update(NOW + 60 * minute, True)
    assert [c[1]["NbaFeedRefused"] for c in calls if c[0] == "put"] == [1, 2, 3]
    beat.probe = lambda: True
    beat.update(NOW + 180, True)
    assert calls[-1] == ("put", {"Heartbeat": 1, "NbaFeedRefused": 0})


def test_heartbeat_skips_the_feed_check_between_games():
    beat, calls = heartbeat()
    beat.probe = lambda: (_ for _ in ()).throw(AssertionError("probed"))
    beat.update(NOW, False)
    assert calls[-1] == ("put", {"Heartbeat": 1})


def test_heartbeat_survives_aws_and_probe_errors():
    def boom(**kwargs):
        raise OSError("offline")
    cloudwatch = SimpleNamespace(put_metric_data=boom, enable_alarm_actions=boom, disable_alarm_actions=boom)
    beat = run_poller.Heartbeat(cloudwatch, probe=lambda: 1 / 0)
    beat.update(NOW, True)
    beat.update(NOW, False)


def test_game_window_opens_an_hour_before_kickoff_and_ends_with_polling():
    runner = PiRunner(fake_poller(), InlineExecutor())
    assert not runner.in_game_window(NOW)
    runner.kickoff_at = NOW + 7200
    assert not runner.in_game_window(NOW + 3599)
    assert runner.in_game_window(NOW + 3600)
    runner.enable()
    assert runner.in_game_window(NOW + 9000)
    runner.disable()
    assert not runner.in_game_window(NOW + 9000)


def test_scoreboard_probe_uses_the_poller_fetch():
    poller = fake_poller(fetch_nba_data=lambda url: ({"scoreboard": {}} if "todaysScoreboard" in url else None, None))
    assert PiRunner(poller, InlineExecutor()).scoreboard_reachable()
    poller.fetch_nba_data = lambda url: (None, None)
    assert not PiRunner(poller, InlineExecutor()).scoreboard_reachable()
