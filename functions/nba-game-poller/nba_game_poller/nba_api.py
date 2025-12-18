import gzip
import json
import random
import urllib.error
import urllib.request


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

