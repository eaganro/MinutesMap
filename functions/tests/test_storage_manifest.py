import json
from unittest.mock import MagicMock

import boto3
import pytest
from botocore.exceptions import ClientError
from moto import mock_aws

from nba_game_poller.storage import update_manifest

BUCKET = "test-bucket"
KEY = "data/manifest.json"


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        yield client


def read(s3):
    return set(json.loads(s3.get_object(Bucket=BUCKET, Key=KEY)["Body"].read()))


def test_creates_manifest_when_missing(s3):
    update_manifest(s3_client=s3, bucket=BUCKET, manifest_key=KEY, game_id="2026-10-05-nyk-phi")
    assert read(s3) == {"2026-10-05-nyk-phi"}


def test_adds_to_existing_manifest(s3):
    s3.put_object(Bucket=BUCKET, Key=KEY, Body=json.dumps(["a", "b"]))
    update_manifest(s3_client=s3, bucket=BUCKET, manifest_key=KEY, game_id="c")
    assert read(s3) == {"a", "b", "c"}


def test_read_failure_raises_without_overwriting():
    client = MagicMock()
    client.get_object.side_effect = ClientError(
        {"Error": {"Code": "SlowDown", "Message": "throttled"}}, "GetObject"
    )
    with pytest.raises(ClientError):
        update_manifest(s3_client=client, bucket=BUCKET, manifest_key=KEY, game_id="c")
    client.put_object.assert_not_called()


def test_corrupt_manifest_raises_without_overwriting(s3):
    s3.put_object(Bucket=BUCKET, Key=KEY, Body=json.dumps({"not": "a list"}))
    with pytest.raises(ValueError):
        update_manifest(s3_client=s3, bucket=BUCKET, manifest_key=KEY, game_id="c")
    assert json.loads(s3.get_object(Bucket=BUCKET, Key=KEY)["Body"].read()) == {"not": "a list"}
