CANONICAL_SEASON_TYPES = ("preseason", "regular", "play_in", "playoffs")
DEFAULT_SEASON_TYPE = "regular"


def _candidate_values(source):
    if isinstance(source, dict):
        for key in (
            "seasonType",
            "gameType",
            "gameLabel",
            "gameSubLabel",
            "label",
            "sublabel",
            "seriesText",
        ):
            value = source.get(key)
            if value not in (None, ""):
                yield value
        return
    if source not in (None, ""):
        yield source


def normalize_season_type(value):
    text = str(value or "").strip().lower()
    if not text:
        return None
    normalized = text.replace("-", "_").replace(" ", "_")
    if normalized in CANONICAL_SEASON_TYPES:
        return normalized
    compact = "".join(ch for ch in text if ch.isalnum())
    if "preseason" in compact:
        return "preseason"
    if "playin" in compact:
        return "play_in"
    if "playoff" in compact or "postseason" in compact:
        return "playoffs"
    if "regular" in compact:
        return "regular"
    return None


def season_type_from_game_id(game_id):
    raw = str(game_id or "").strip()
    if len(raw) < 3 or not raw[:3].isdigit():
        return None
    prefix = raw[:3]
    if prefix == "001":
        return "preseason"
    if prefix == "002":
        return "regular"
    if prefix == "004":
        return "playoffs"
    if prefix == "005":
        return "play_in"
    return None


def derive_season_type(*sources, game_id=None, nba_game_id=None, default=DEFAULT_SEASON_TYPE):
    for candidate in (nba_game_id, game_id):
        season_type = season_type_from_game_id(candidate)
        if season_type:
            return season_type
    for source in sources:
        for value in _candidate_values(source):
            season_type = normalize_season_type(value)
            if season_type:
                return season_type
    return default
