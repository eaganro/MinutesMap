import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "jobs"))

import build_page_artifacts as module  # noqa: E402


def sample_gamepack():
    return {
        "v": 1,
        "id": "0022500003",
        "publicId": "2026-02-03-phi-gsw",
        "box": {
            "start": "2026-02-03T22:10:00Z",
            "teams": {
                "away": {
                    "id": 1610612755,
                    "abbr": "PHI",
                    "name": "76ers",
                    "players": [
                        {
                            "id": 201939,
                            "first": "Tyrese",
                            "last": "Maxey",
                            "stats": {
                                "min": "34:12",
                                "pts": 27,
                                "fgm": 10,
                                "fga": 18,
                                "tpm": 3,
                                "tpa": 7,
                                "ftm": 4,
                                "fta": 4,
                                "oreb": 1,
                                "dreb": 3,
                                "ast": 6,
                                "stl": 2,
                                "blk": 0,
                                "to": 2,
                                "pf": 2,
                                "pm": 8,
                            },
                        },
                        {
                            "id": 203954,
                            "first": "Joel",
                            "last": "Embiid",
                            "stats": {
                                "min": "31:00",
                                "pts": 24,
                                "fgm": 8,
                                "fga": 15,
                                "tpm": 1,
                                "tpa": 2,
                                "ftm": 7,
                                "fta": 8,
                                "oreb": 2,
                                "dreb": 10,
                                "ast": 4,
                                "stl": 1,
                                "blk": 2,
                                "to": 3,
                                "pf": 3,
                                "pm": 6,
                            },
                        },
                    ],
                },
                "home": {
                    "id": 1610612744,
                    "abbr": "GSW",
                    "name": "Warriors",
                    "players": [
                        {
                            "id": 2019399,
                            "first": "Stephen",
                            "last": "Curry",
                            "stats": {
                                "min": "35:05",
                                "pts": 29,
                                "fgm": 11,
                                "fga": 21,
                                "tpm": 5,
                                "tpa": 12,
                                "ftm": 2,
                                "fta": 2,
                                "oreb": 0,
                                "dreb": 4,
                                "ast": 7,
                                "stl": 1,
                                "blk": 0,
                                "to": 4,
                                "pf": 1,
                                "pm": -3,
                            },
                        }
                    ],
                },
            },
        },
        "flow": {
            "v": 2,
            "last": {
                "quarter": 4,
                "time": "00.00",
                "awayScore": 112,
                "homeScore": 108,
            },
            "players": {
                "away": {
                    "Tyrese Maxey": [
                        {
                            "quarter": 1,
                            "time": "11:32",
                            "type": "2pt",
                            "text": "Tyrese Maxey make 2pt layup",
                            "seq": 1,
                            "r": "m",
                            "awayScore": 2,
                            "homeScore": 0,
                        },
                        {
                            "quarter": 1,
                            "time": "08:44",
                            "type": "3pt",
                            "text": "Tyrese Maxey miss 3pt jumper",
                            "seq": 7,
                            "r": "x",
                            "awayScore": 8,
                            "homeScore": 6,
                        },
                        {
                            "quarter": 2,
                            "time": "06:10",
                            "type": "Assist",
                            "text": "Tyrese Maxey assist",
                            "seq": 31,
                        },
                        {
                            "quarter": 4,
                            "time": "01:22",
                            "type": "Steal",
                            "text": "Tyrese Maxey steal",
                            "seq": 81,
                        },
                    ],
                    "Joel Embiid": [
                        {
                            "quarter": 1,
                            "time": "10:55",
                            "type": "free throw",
                            "text": "Joel Embiid ft 1/2 make",
                            "seq": 2,
                            "r": "m",
                            "awayScore": 3,
                            "homeScore": 0,
                        },
                        {
                            "quarter": 3,
                            "time": "07:20",
                            "type": "Rebound",
                            "text": "Joel Embiid reb def",
                            "seq": 58,
                        },
                    ],
                },
                "home": {
                    "Stephen Curry": [
                        {
                            "quarter": 1,
                            "time": "09:50",
                            "type": "3pt",
                            "text": "Stephen Curry make 3pt jumper",
                            "seq": 10,
                            "r": "m",
                            "awayScore": 8,
                            "homeScore": 9,
                        },
                        {
                            "quarter": 4,
                            "time": "00:51",
                            "type": "Turnover",
                            "text": "Stephen Curry turnover bad pass",
                            "seq": 88,
                        },
                    ]
                },
            },
            "segments": {
                "away": {
                    "Tyrese Maxey": [
                        {"quarter": 1, "start": "12:00", "end": "06:00"},
                        {"quarter": 4, "start": "08:00", "end": "00:00"},
                    ],
                    "Joel Embiid": [
                        {"quarter": 1, "start": "12:00", "end": "05:00"},
                    ],
                },
                "home": {
                    "Stephen Curry": [
                        {"quarter": 1, "start": "12:00", "end": "00:00"},
                    ]
                },
            },
        },
    }


def sample_abbreviated_flow_gamepack():
    gamepack = sample_gamepack()
    gamepack["publicId"] = "2026-02-04-lal-mem"
    gamepack["box"]["teams"]["away"] = {
        "id": 1610612747,
        "abbr": "LAL",
        "name": "Lakers",
        "players": [
            {
                "id": 2544,
                "first": "LeBron",
                "last": "James",
                "stats": {
                    "min": "36:04",
                    "pts": 31,
                    "fgm": 12,
                    "fga": 18,
                    "tpm": 1,
                    "tpa": 5,
                    "ftm": 6,
                    "fta": 6,
                    "oreb": 0,
                    "dreb": 9,
                    "ast": 6,
                    "stl": 0,
                    "blk": 0,
                    "to": 4,
                    "pf": 3,
                    "pm": 11,
                },
            }
        ],
    }
    gamepack["box"]["teams"]["home"] = {
        "id": 1610612763,
        "abbr": "MEM",
        "name": "Grizzlies",
        "players": [
            {
                "id": 1629630,
                "first": "Ja",
                "last": "Morant",
                "stats": {
                    "min": "31:22",
                    "pts": 16,
                    "fgm": 7,
                    "fga": 18,
                    "tpm": 0,
                    "tpa": 3,
                    "ftm": 2,
                    "fta": 3,
                    "oreb": 0,
                    "dreb": 3,
                    "ast": 11,
                    "stl": 2,
                    "blk": 0,
                    "to": 3,
                    "pf": 1,
                    "pm": -21,
                },
            }
        ],
    }
    gamepack["flow"]["players"] = {
        "away": {
            "L. James": [
                {
                    "quarter": 1,
                    "time": "11:32",
                    "type": "2pt",
                    "text": "LeBron James make 2pt layup",
                    "seq": 1,
                    "r": "m",
                },
                {
                    "quarter": 2,
                    "time": "06:10",
                    "type": "Assist",
                    "text": "LeBron James assist",
                    "seq": 31,
                },
            ]
        },
        "home": {
            "J. Morant": [
                {
                    "quarter": 1,
                    "time": "10:55",
                    "type": "3pt",
                    "text": "Ja Morant miss 3pt jumper",
                    "seq": 2,
                    "r": "x",
                }
            ]
        },
    }
    gamepack["flow"]["segments"] = {
        "away": {
            "L. James": [
                {"quarter": 1, "start": "12:00", "end": "06:00"},
            ]
        },
        "home": {
            "J. Morant": [
                {"quarter": 1, "start": "12:00", "end": "00:00"},
            ]
        },
    }
    gamepack["flow"]["last"] = {
        "quarter": 4,
        "time": "00.00",
        "awayScore": 110,
        "homeScore": 102,
    }
    return gamepack


def test_derive_game_artifacts_builds_team_and_player_rows():
    derived = module.derive_game_artifacts(
        gamepack=sample_gamepack(),
        root_prefix="data/",
        gamepack_prefix="gamepack/",
        page_prefix="pages/",
        identity_registry=module.build_identity_registry([sample_gamepack()]),
    )

    assert derived["season"] == "2025-26"
    assert len(derived["teams"]) == 2
    assert len(derived["players"]) == 3

    away_team = next(item for item in derived["teams"] if item["team"]["abbr"] == "PHI")
    assert away_team["row"]["result"] == "W"
    assert away_team["row"]["teamScore"] == 112
    assert away_team["row"]["opponentAbbr"] == "GSW"
    assert away_team["row"]["gamepackKey"] == "data/gamepack/2026-02-03-phi-gsw.json.gz"

    maxey = next(item for item in derived["players"] if item["player"]["name"] == "Tyrese Maxey")
    assert maxey["seasonKey"] == "pages/players/201939/2025-26.json"
    assert maxey["row"]["teamAbbr"] == "PHI"
    assert "pbp" not in maxey["row"]
    assert maxey["row"]["playerId"] == 201939
    assert maxey["row"]["playerKey"] == "201939"
    assert len(maxey["row"]["detail"]["actions"]) == 4
    assert len(maxey["row"]["detail"]["segments"]) == 2


def test_derive_game_artifacts_matches_abbreviated_flow_labels():
    gamepack = sample_abbreviated_flow_gamepack()
    derived = module.derive_game_artifacts(
        gamepack=gamepack,
        root_prefix="data/",
        gamepack_prefix="gamepack/",
        page_prefix="pages/",
        identity_registry=module.build_identity_registry([gamepack]),
    )

    lebron = next(item for item in derived["players"] if item["player"]["name"] == "LeBron James")
    assert lebron["row"]["playerId"] == 2544
    assert len(lebron["row"]["detail"]["actions"]) == 2
    assert len(lebron["row"]["detail"]["segments"]) == 1

    morant = next(item for item in derived["players"] if item["player"]["name"] == "Ja Morant")
    assert morant["row"]["playerId"] == 1629630
    assert len(morant["row"]["detail"]["actions"]) == 1
    assert len(morant["row"]["detail"]["segments"]) == 1


def test_upsert_and_recalc_artifacts_are_idempotent():
    derived = module.derive_game_artifacts(
        gamepack=sample_gamepack(),
        root_prefix="data/",
        gamepack_prefix="gamepack/",
        page_prefix="pages/",
        identity_registry=module.build_identity_registry([sample_gamepack()]),
    )

    team_item = next(item for item in derived["teams"] if item["team"]["abbr"] == "PHI")
    team_artifact = module.init_team_artifact(team_item["team"], team_item["season"])
    team_artifact["games"] = module.upsert_game_row(team_artifact["games"], team_item["row"])
    team_artifact["games"] = module.upsert_game_row(team_artifact["games"], team_item["row"])
    module.recalc_team_artifact(team_artifact)

    assert len(team_artifact["games"]) == 1
    assert team_artifact["record"] == {"wins": 1, "losses": 0, "ties": 0}
    assert team_artifact["games"][0]["recordAfter"] == {"wins": 1, "losses": 0, "ties": 0}

    player_item = next(item for item in derived["players"] if item["player"]["name"] == "Tyrese Maxey")
    player_artifact = module.init_player_artifact(player_item["player"], player_item["season"])
    player_artifact["games"] = module.upsert_game_row(player_artifact["games"], player_item["row"])
    player_artifact["games"] = module.upsert_game_row(player_artifact["games"], player_item["row"])
    module.recalc_player_artifact(player_artifact)

    assert len(player_artifact["games"]) == 1
    assert player_artifact["totals"]["games"] == 1
    assert player_artifact["record"] == {"wins": 1, "losses": 0, "ties": 0}
    assert player_artifact["totals"]["box"]["pts"] == 27
    assert "pbp" not in player_artifact["totals"]
    assert "pbp" not in player_artifact["averages"]
    assert len(player_artifact["games"][0]["detail"]["actions"]) == 4


def test_identity_registry_recovers_missing_player_ids_from_other_games():
    gamepack_with_ids = sample_gamepack()
    gamepack_missing_ids = sample_gamepack()
    gamepack_missing_ids["publicId"] = "2026-02-05-phi-lal"
    for side in ("away", "home"):
        players = (((gamepack_missing_ids.get("box") or {}).get("teams") or {}).get(side) or {}).get("players") or []
        for player in players:
            player.pop("id", None)

    registry = module.build_identity_registry([gamepack_with_ids, gamepack_missing_ids])
    derived = module.derive_game_artifacts(
        gamepack=gamepack_missing_ids,
        root_prefix="data/",
        gamepack_prefix="gamepack/",
        page_prefix="pages/",
        identity_registry=registry,
    )

    maxey = next(item for item in derived["players"] if item["player"]["name"] == "Tyrese Maxey")
    assert maxey["player"]["id"] == 201939
    assert maxey["player"]["key"] == "201939"
    assert maxey["row"]["playerId"] == 201939


def test_identity_registry_recovers_same_player_after_team_change():
    gamepack_with_phi_id = sample_gamepack()
    gamepack_with_phi_id["box"]["teams"]["away"]["players"] = [
        {
            "id": 1629008,
            "first": "Kelly",
            "last": "Oubre Jr.",
            "stats": {
                "min": "30:00",
                "pts": 20,
                "fgm": 8,
                "fga": 14,
                "tpm": 2,
                "tpa": 5,
                "ftm": 2,
                "fta": 3,
                "oreb": 1,
                "dreb": 4,
                "ast": 2,
                "stl": 1,
                "blk": 0,
                "to": 1,
                "pf": 2,
                "pm": 5,
            },
        }
    ]
    gamepack_with_phi_id["flow"]["players"]["away"] = {
        "Kelly Oubre Jr.": [
            {"quarter": 1, "time": "11:00", "type": "2pt", "text": "Kelly Oubre Jr. make 2pt jumper", "seq": 1, "r": "m"}
        ]
    }
    gamepack_with_phi_id["flow"]["segments"]["away"] = {
        "Kelly Oubre Jr.": [{"quarter": 1, "start": "12:00", "end": "06:00"}]
    }

    gamepack_missing_id_new_team = sample_gamepack()
    gamepack_missing_id_new_team["publicId"] = "2026-02-05-dal-gsw"
    gamepack_missing_id_new_team["box"]["teams"]["away"]["abbr"] = "DAL"
    gamepack_missing_id_new_team["box"]["teams"]["away"]["name"] = "Mavericks"
    gamepack_missing_id_new_team["box"]["teams"]["away"]["players"] = [
        {
            "first": "Kelly",
            "last": "Oubre Jr.",
            "stats": {
                "min": "28:00",
                "pts": 18,
                "fgm": 7,
                "fga": 13,
                "tpm": 1,
                "tpa": 4,
                "ftm": 3,
                "fta": 4,
                "oreb": 1,
                "dreb": 3,
                "ast": 2,
                "stl": 1,
                "blk": 0,
                "to": 1,
                "pf": 2,
                "pm": 3,
            },
        }
    ]
    gamepack_missing_id_new_team["flow"]["players"]["away"] = {
        "Kelly Oubre Jr.": [
            {"quarter": 1, "time": "11:00", "type": "2pt", "text": "Kelly Oubre Jr. make 2pt jumper", "seq": 1, "r": "m"}
        ]
    }
    gamepack_missing_id_new_team["flow"]["segments"]["away"] = {
        "Kelly Oubre Jr.": [{"quarter": 1, "start": "12:00", "end": "06:00"}]
    }

    registry = module.build_identity_registry([gamepack_with_phi_id, gamepack_missing_id_new_team])
    derived = module.derive_game_artifacts(
        gamepack=gamepack_missing_id_new_team,
        root_prefix="data/",
        gamepack_prefix="gamepack/",
        page_prefix="pages/",
        identity_registry=registry,
    )

    oubre = next(item for item in derived["players"] if item["player"]["name"] == "Kelly Oubre Jr.")
    assert oubre["player"]["id"] == 1629008
    assert oubre["player"]["key"] == "1629008"
    assert oubre["row"]["playerId"] == 1629008
