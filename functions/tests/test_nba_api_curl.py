import subprocess

from nba_game_poller import nba_api

URL = "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0012600024.json"


def fake_curl(monkeypatch, *, code, body=b"", etag='"new"'):
    seen = {}

    def run(cmd, **kwargs):
        seen["cmd"] = cmd
        with open(cmd[cmd.index("-o") + 1], "wb") as handle:
            handle.write(body)
        headers = f"HTTP/2 {code}\r\ncontent-type: application/json\r\netag: {etag}\r\n\r\n"
        return subprocess.CompletedProcess(cmd, 0, stdout=headers + str(code), stderr="")

    monkeypatch.setattr(nba_api.subprocess, "run", run)
    return seen


def test_curl_fetch_returns_json_and_etag(monkeypatch):
    seen = fake_curl(monkeypatch, code=200, body=b'{"game": {"gameStatus": 2}}')
    assert nba_api.fetch_nba_data_curl(URL, user_agent="UA") == ({"game": {"gameStatus": 2}}, '"new"')
    assert "Referer: https://www.nba.com/" in seen["cmd"]
    assert "User-Agent: UA" in seen["cmd"]


def test_curl_fetch_sends_etag_and_handles_304(monkeypatch):
    seen = fake_curl(monkeypatch, code=304)
    assert nba_api.fetch_nba_data_curl(URL, etag='"old"') == (None, '"old"')
    assert 'If-None-Match: "old"' in seen["cmd"]


def test_curl_fetch_rejects_blocked_html(monkeypatch):
    fake_curl(monkeypatch, code=403, body=b"<html>Access Denied</html>")
    assert nba_api.fetch_nba_data_curl(URL, etag='"old"') == (None, '"old"')


def test_curl_fetch_rejects_non_json_200(monkeypatch):
    fake_curl(monkeypatch, code=200, body=b"<html>site</html>")
    assert nba_api.fetch_nba_data_curl(URL) == (None, None)
