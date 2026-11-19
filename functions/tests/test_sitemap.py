import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../nba-game-poller"))

from nba_game_poller.sitemap import build_sitemap_xml, list_game_pages, upload_sitemap  # noqa: E402


class FakePaginator:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def paginate(self, **kwargs):
        self.calls.append(kwargs)
        return iter(self.pages)


class FakeS3:
    def __init__(self, pages=()):
        self.paginator = FakePaginator(list(pages))
        self.puts = []

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return self.paginator

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


def obj(key, modified):
    return {"Key": key, "LastModified": datetime.fromisoformat(modified).replace(tzinfo=timezone.utc)}


def test_list_game_pages_keeps_finished_games_with_their_last_change():
    s3 = FakeS3(
        [
            {
                "Contents": [
                    obj("data/gamepack/2026-11-17-bos-phi.json.gz", "2026-11-18T04:10:00"),
                    obj("data/gamepack/2026-11-18-lal-gsw.json.gz", "2026-11-19T06:00:00"),
                    # still in progress (today)
                    obj("data/gamepack/2026-11-19-mia-nyk.json.gz", "2026-11-19T23:50:00"),
                ]
            },
            {
                "Contents": [
                    # not game pages
                    obj("data/gamepack/0022500123.json.gz", "2025-11-01T00:00:00"),
                    obj("data/gamepack/2026-11-17-bos-phi.json", "2026-11-18T04:10:00"),
                    obj("data/gamepack/notes.txt", "2026-11-01T00:00:00"),
                ]
            },
            {},
        ]
    )

    pages = list_game_pages(
        s3_client=s3, bucket="bucket", gamepack_prefix="data/gamepack/", before_date="2026-11-19"
    )

    assert pages == {"2026-11-17-bos-phi": "2026-11-18", "2026-11-18-lal-gsw": "2026-11-19"}
    assert s3.paginator.calls == [{"Bucket": "bucket", "Prefix": "data/gamepack/"}]


def test_build_sitemap_xml_lists_home_then_games_newest_first():
    xml = build_sitemap_xml({"2026-11-17-bos-phi": "2026-11-18", "2026-11-18-lal-gsw": "2026-11-19"})

    assert xml == (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        "<url><loc>https://minutesmap.com/</loc></url>\n"
        "<url><loc>https://minutesmap.com/2026-11-18-lal-gsw</loc><lastmod>2026-11-19</lastmod></url>\n"
        "<url><loc>https://minutesmap.com/2026-11-17-bos-phi</loc><lastmod>2026-11-18</lastmod></url>\n"
        "</urlset>\n"
    )


def test_upload_sitemap_writes_xml():
    s3 = FakeS3()

    upload_sitemap(s3_client=s3, bucket="bucket", key="data/sitemap.xml", game_pages={})

    [put] = s3.puts
    assert put["Bucket"] == "bucket"
    assert put["Key"] == "data/sitemap.xml"
    assert put["ContentType"] == "application/xml"
    assert put["Body"].decode("utf-8").count("<url>") == 1
