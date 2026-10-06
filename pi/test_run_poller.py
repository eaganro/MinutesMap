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
