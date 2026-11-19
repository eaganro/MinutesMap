"""The site's sitemap: every game page with stored data, so search engines can find them.

The game cards link to games, but only for the day on screen; the sitemap lists the rest.
It is written to data/sitemap.xml, which CloudFront serves as /sitemap.xml.
"""
import re

SITE_URL = "https://minutesmap.com"
GAMEPACK_FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}-[a-z0-9]+-[a-z0-9]+)\.json\.gz$")
# The sitemap protocol's limit for one file; at about 1,400 games a season it is decades away.
MAX_URLS = 50_000


def list_game_pages(*, s3_client, bucket, gamepack_prefix, before_date):
    """Returns {game id: date its data last changed} for every stored game dated before
    `before_date` (YYYY-MM-DD), so games still in progress are left for the next run."""
    pages = {}
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=gamepack_prefix):
        for obj in page.get("Contents", []):
            match = GAMEPACK_FILE_RE.match(obj["Key"][len(gamepack_prefix):])
            if not match or match.group(1)[:10] >= before_date:
                continue
            pages[match.group(1)] = obj["LastModified"].strftime("%Y-%m-%d")
    return pages


def build_sitemap_xml(game_pages):
    """The home page, then the games newest first."""
    game_ids = sorted(game_pages, reverse=True)[: MAX_URLS - 1]
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f"<url><loc>{SITE_URL}/</loc></url>",
    ]
    lines += [
        f"<url><loc>{SITE_URL}/{game_id}</loc><lastmod>{game_pages[game_id]}</lastmod></url>"
        for game_id in game_ids
    ]
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def upload_sitemap(*, s3_client, bucket, key, game_pages):
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=build_sitemap_xml(game_pages).encode("utf-8"),
        ContentType="application/xml",
        CacheControl="public, max-age=3600",
    )
