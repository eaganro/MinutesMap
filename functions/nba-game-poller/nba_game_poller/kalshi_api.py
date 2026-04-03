import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime


KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2"
KALSHI_NBA_GAME_SERIES = "KXNBAGAME"
MONTH_CODES = (
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
)


def normalize_team_code(value):
    if value is None:
        return None
    normalized = "".join(ch for ch in str(value).strip().upper() if ch.isalnum())
    return normalized or None


def build_kalshi_nba_event_ticker(date_str, away_team, home_team, series_ticker=KALSHI_NBA_GAME_SERIES):
    away = normalize_team_code(away_team)
    home = normalize_team_code(home_team)
    if not date_str or not away or not home:
        return None
    try:
        parsed = datetime.strptime(str(date_str).strip(), "%Y-%m-%d")
    except ValueError:
        return None
    date_code = f"{parsed.year % 100:02d}{MONTH_CODES[parsed.month - 1]}{parsed.day:02d}"
    return f"{series_ticker}-{date_code}{away}{home}"


def fetch_kalshi_json(path, params=None, user_agent=None, timeout=5):
    query = urllib.parse.urlencode(params or {}, doseq=True)
    url = f"{KALSHI_API_BASE}{path}"
    if query:
        url = f"{url}?{query}"

    req = urllib.request.Request(url)
    req.add_header("Accept", "application/json")
    if user_agent:
        req.add_header("User-Agent", user_agent)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status != 200:
                return None
            payload = response.read()
            return json.loads(payload)
    except urllib.error.HTTPError as err:
        if err.code != 404:
            print(f"Kalshi HTTP Error {url}: {err.code} {err.reason}")
        return None
    except Exception as err:
        print(f"Kalshi request failed for {url}: {err}")
        return None


def fetch_kalshi_event_markets(event_ticker, user_agent=None):
    if not event_ticker:
        return []
    payload = fetch_kalshi_json(
        "/markets",
        params={"event_ticker": event_ticker, "limit": 20},
        user_agent=user_agent,
    )
    markets = payload.get("markets") if isinstance(payload, dict) else None
    return markets if isinstance(markets, list) else []


def parse_kalshi_price(value):
    if value is None or value == "":
        return None
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    if price < 0 or price > 1:
        return None
    return price


def get_market_midpoint_or_last(market):
    if not isinstance(market, dict):
        return None, None
    bid = parse_kalshi_price(market.get("yes_bid_dollars"))
    ask = parse_kalshi_price(market.get("yes_ask_dollars"))
    if bid is not None and ask is not None:
        return (bid + ask) / 2.0, "midpoint"
    last = parse_kalshi_price(market.get("last_price_dollars"))
    if last is not None:
        return last, "last"
    return None, None
