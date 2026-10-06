import gzip
import json
import random
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone

from botocore.exceptions import ClientError

CDN_JSON_ROOT = "https://cdn.nba.com/static/json/"
MIRROR_STALE_SECONDS = 6 * 3600


USER_AGENTS = [
    # Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    # Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    # Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    # Safari on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    # Edge on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
]


def fetch_nba_data_urllib(url, etag=None, user_agent=None):
    """
    Fetch JSON from NBA CDN using only the stdlib, supporting ETag 304 short-circuiting.
    Returns: (data_or_None, etag_or_original)
    """
    if not user_agent:
        user_agent = random.choice(USER_AGENTS)

    req = urllib.request.Request(url)
    req.add_header("User-Agent", user_agent)
    req.add_header("Accept", "application/json, text/plain, */*")
    req.add_header("Accept-Language", "en-US,en;q=0.9")
    req.add_header("Referer", "https://www.nba.com/")
    req.add_header("Origin", "https://www.nba.com")
    req.add_header("Connection", "keep-alive")
    req.add_header("Accept-Encoding", "gzip, deflate")

    if etag:
        req.add_header("If-None-Match", etag)

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status != 200:
                return None, etag

            content = response.read()
            if content.startswith(b"\x1f\x8b"):
                try:
                    content = gzip.decompress(content)
                except OSError:
                    pass

            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                print(f"JSON Decode Error for {url}")
                return None, etag

            new_etag = response.getheader("ETag")
            return data, new_etag

    except urllib.error.HTTPError as e:
        if e.code == 304:
            return None, etag
        print(f"Network Error {url}: {e.code} {e.reason}")
        return None, etag
    except Exception as e:
        print(f"Network Exception {url}: {e}")
        return None, etag


def fetch_nba_data_curl(url, etag=None, user_agent=None, timeout=10):
    """
    Same contract as fetch_nba_data_urllib, but via the curl binary. The NBA CDN rejects
    Python's TLS handshake on residential hosts like the Pi while accepting curl.
    """
    if not user_agent:
        user_agent = random.choice(USER_AGENTS)
    headers = {
        "User-Agent": user_agent,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nba.com/",
        "Origin": "https://www.nba.com",
    }
    if etag:
        headers["If-None-Match"] = etag
    with tempfile.NamedTemporaryFile() as body:
        cmd = ["curl", "-s", "--compressed", "--max-time", str(timeout),
               "-o", body.name, "-D", "-", "-w", "%{http_code}"]
        for name, value in headers.items():
            cmd += ["-H", f"{name}: {value}"]
        try:
            result = subprocess.run(cmd + [url], capture_output=True, text=True, timeout=timeout + 5)
        except (OSError, subprocess.TimeoutExpired) as e:
            print(f"Network Exception {url}: {e}")
            return None, etag
        header_text, _, code = result.stdout.rpartition("\n")
        if code == "304":
            return None, etag
        if code != "200":
            print(f"Network Error {url}: {code or 'curl exit ' + str(result.returncode)}")
            return None, etag
        new_etag = etag
        for line in header_text.splitlines():
            name, _, value = line.partition(":")
            if name.strip().lower() == "etag":
                new_etag = value.strip()
        body.seek(0)
        try:
            return json.loads(body.read()), new_etag
        except json.JSONDecodeError:
            print(f"JSON Decode Error for {url}")
            return None, etag


def mirror_key_for_url(url, prefix):
    """Map a cdn.nba.com/static/json URL to its key in the S3 feed mirror."""
    if not url.startswith(CDN_JSON_ROOT):
        return None
    return prefix + url[len(CDN_JSON_ROOT):]


def fetch_nba_data_from_mirror(s3_client, bucket, prefix, url, etag=None):
    """
    Read an NBA feed from the S3 mirror written by relay/nba_feed_relay.py.
    AWS addresses are blocked by the NBA CDN, so a residential host fetches the feeds.
    Same contract as fetch_nba_data_urllib: (data_or_None, etag_or_original).
    """
    key = mirror_key_for_url(url, prefix)
    if not key:
        print(f"Mirror: no mirror key for {url}")
        return None, etag

    kwargs = {"Bucket": bucket, "Key": key}
    if etag:
        kwargs["IfNoneMatch"] = etag
    try:
        response = s3_client.get_object(**kwargs)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        status = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if code in ("304", "NotModified") or status == 304:
            return None, etag
        if code in ("NoSuchKey", "404", "NotFound"):
            print(f"Mirror: {key} not found")
            return None, etag
        print(f"Mirror Error {key}: {code}")
        return None, etag

    last_modified = response.get("LastModified")
    if last_modified:
        age = (datetime.now(timezone.utc) - last_modified).total_seconds()
        if age > MIRROR_STALE_SECONDS:
            print(f"Mirror: {key} is stale ({int(age)}s old); is the relay running?")

    content = response["Body"].read()
    if content.startswith(b"\x1f\x8b"):
        content = gzip.decompress(content)
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        print(f"Mirror: JSON Decode Error for {key}")
        return None, etag
    return data, response.get("ETag")
