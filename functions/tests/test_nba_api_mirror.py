import gzip
import json

import boto3
import pytest
from moto import mock_aws

from nba_game_poller.nba_api import fetch_nba_data_from_mirror, mirror_key_for_url

BUCKET = "test-bucket"
PREFIX = "private/nba-feed/"
BOX_URL = "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0012600024.json"
BOX_KEY = "private/nba-feed/liveData/boxscore/boxscore_0012600024.json"


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        yield client


def test_mirror_key_maps_cdn_json_paths():
    assert mirror_key_for_url(BOX_URL, PREFIX) == BOX_KEY
    assert mirror_key_for_url("https://example.com/x.json", PREFIX) is None


def test_reads_mirrored_json_and_returns_s3_etag(s3):
    s3.put_object(Bucket=BUCKET, Key=BOX_KEY, Body=json.dumps({"game": {"gameStatus": 2}}))
    data, etag = fetch_nba_data_from_mirror(s3, BUCKET, PREFIX, BOX_URL)
    assert data == {"game": {"gameStatus": 2}}
    assert etag


def test_reads_gzipped_body(s3):
    s3.put_object(Bucket=BUCKET, Key=BOX_KEY, Body=gzip.compress(b'{"ok": true}'))
    data, _ = fetch_nba_data_from_mirror(s3, BUCKET, PREFIX, BOX_URL)
    assert data == {"ok": True}


def test_unchanged_object_returns_no_data(s3):
    s3.put_object(Bucket=BUCKET, Key=BOX_KEY, Body=b"{}")
    _, etag = fetch_nba_data_from_mirror(s3, BUCKET, PREFIX, BOX_URL)
    assert fetch_nba_data_from_mirror(s3, BUCKET, PREFIX, BOX_URL, etag) == (None, etag)


def test_missing_object_keeps_previous_etag(s3):
    assert fetch_nba_data_from_mirror(s3, BUCKET, PREFIX, BOX_URL, '"old"') == (None, '"old"')
