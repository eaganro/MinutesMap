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


def fetch_kalshi_market_candlesticks(
    series_ticker,
    market_ticker,
    start_ts,
    end_ts,
    *,
    period_interval=1,
    include_latest_before_start=False,
    user_agent=None,
):
    if not series_ticker or not market_ticker or start_ts is None or end_ts is None:
        return []

    try:
        start_value = int(start_ts)
        end_value = int(end_ts)
        interval_value = int(period_interval)
    except (TypeError, ValueError):
        return []

    if start_value < 0 or end_value <= 0 or interval_value <= 0:
        return []
    if end_value < start_value:
        return []

    payload = fetch_kalshi_json(
        f"/series/{urllib.parse.quote(str(series_ticker), safe='')}/markets/"
        f"{urllib.parse.quote(str(market_ticker), safe='')}/candlesticks",
        params={
            "start_ts": start_value,
            "end_ts": end_value,
            "period_interval": interval_value,
            "include_latest_before_start": str(bool(include_latest_before_start)).lower(),
        },
        user_agent=user_agent,
    )
    candles = payload.get("candlesticks") if isinstance(payload, dict) else None
    return candles if isinstance(candles, list) else []


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


def get_candlestick_midpoint_or_last(candlestick):
    if not isinstance(candlestick, dict):
        return None, None

    yes_bid = candlestick.get("yes_bid") if isinstance(candlestick.get("yes_bid"), dict) else {}
    yes_ask = candlestick.get("yes_ask") if isinstance(candlestick.get("yes_ask"), dict) else {}
    bid = parse_kalshi_price(yes_bid.get("close_dollars"))
    ask = parse_kalshi_price(yes_ask.get("close_dollars"))
    if bid is not None and ask is not None:
        return (bid + ask) / 2.0, "midpoint"

    price = candlestick.get("price") if isinstance(candlestick.get("price"), dict) else {}
    close_price = parse_kalshi_price(price.get("close_dollars"))
    if close_price is not None:
        return close_price, "last"

    previous_price = parse_kalshi_price(price.get("previous_dollars"))
    if previous_price is not None:
        return previous_price, "last"

    return None, None
