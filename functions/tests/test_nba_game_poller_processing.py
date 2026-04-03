import json
import os
import unittest
from nba_game_poller.playbyplay_processing import process_playbyplay_payload, time_to_seconds

class TestPlayByPlayProcessing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture_path = os.path.join(os.path.dirname(__file__), "fixtures/0012200039.json")
        with open(fixture_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        cls.actions = payload["actions"] if isinstance(payload, dict) else payload

        cls.home_team_id = "1610612759"  # SAS
        cls.away_team_id = "1610612740"  # NOP

    def test_outputs_expected_shape(self):
        processed = process_playbyplay_payload(
            game_id="0012200039",
            actions=self.actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )

        self.assertEqual(processed["v"], 2)
        self.assertEqual(processed["periods"], 4)

        self.assertIsInstance(processed["feed"], list)
        self.assertEqual(len(processed["feed"]), len(self.actions))

        self.assertIsInstance(processed["score"], list)
        self.assertIsInstance(processed["players"], dict)
        self.assertIsInstance(processed["segments"], dict)
        self.assertIsInstance(processed["events"], list)

    def test_score_timeline_final_score_present(self):
        processed = process_playbyplay_payload(
            game_id="0012200039",
            actions=self.actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )
        self.assertGreater(len(processed["score"]), 0)

        last = processed["score"][-1]
        self.assertEqual(last["awayScore"], "111")
        self.assertEqual(last["homeScore"], "97")
        self.assertEqual(last["quarter"], 4)

    def test_assist_actions_are_injected(self):
        processed = process_playbyplay_payload(
            game_id="0012200039",
            actions=self.actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )

        # In the fixture: "Murphy III ... (Jones 1 AST)" at actionNumber 11, NOP.
        away_players = processed["players"]["away"].values()
        self.assertTrue(
            any(
                a.get("type") == "Assist" and a.get("seq") == "11a"
                for player_actions in away_players
                for a in (player_actions or [])
            ),
            "Expected injected assist action '11a' in away player action maps",
        )

    def test_assist_only_player_has_timeline(self):
        actions = [
            {
                "actionNumber": 1,
                "actionId": 1,
                "clock": "PT11M10.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 999,
                "playerName": "Scorer",
                "playerNameI": "S. Scorer",
                "description": "Scorer 2PT Jump Shot (2 PTS) (A. Helper 1 AST)",
                "actionType": "Made Shot",
                "subType": "Jump Shot",
                "scoreHome": "0",
                "scoreAway": "2",
            }
        ]
        processed = process_playbyplay_payload(
            game_id="test-assist-only",
            actions=actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )
        helper_timeline = processed["segments"]["away"].get("A. Helper")
        self.assertIsNotNone(helper_timeline)
        self.assertGreater(len(helper_timeline), 0)
        self.assertEqual(helper_timeline[0]["start"], "1200.00")
        self.assertEqual(helper_timeline[0]["end"], "1110.00")

    def test_all_actions_sorted_period_then_clock_desc(self):
        processed = process_playbyplay_payload(
            game_id="0012200039",
            actions=self.actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )
        all_actions = processed["events"]
        self.assertGreater(len(all_actions), 0)

        def key(a):
            return (int(a.get("quarter") or 0), -time_to_seconds(a.get("time")))

        for prev, cur in zip(all_actions, all_actions[1:]):
            self.assertLessEqual(key(prev), key(cur))

    def test_player_timelines_have_complete_segments(self):
        processed = process_playbyplay_payload(
            game_id="0012200039",
            actions=self.actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )

        timelines = [processed["segments"]["away"], processed["segments"]["home"]]
        checked = 0
        for team_tl in timelines:
            for _, segments in team_tl.items():
                for seg in segments or []:
                    checked += 1
                    self.assertIn("start", seg)
                    self.assertIn("end", seg)
                    self.assertIsNotNone(seg["start"])
                    self.assertIsNotNone(seg["end"])
        self.assertGreater(checked, 0, "Expected at least one playtime segment to be produced")

    def test_seed_players_create_q1_segments(self):
        processed = process_playbyplay_payload(
            game_id="seed-q1",
            actions=[],
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
            seed_home=["A. Starter"],
            seed_away=["B. Starter"],
            seed_clock="PT11M34.00S",
            seed_period=1,
        )
        self.assertIn("A. Starter", processed["players"]["home"])
        self.assertIn("B. Starter", processed["players"]["away"])

        home_segments = processed["segments"]["home"]["A. Starter"]
        away_segments = processed["segments"]["away"]["B. Starter"]
        self.assertEqual(home_segments[0]["start"], "1200.00")
        self.assertEqual(home_segments[0]["end"], "1134.00")
        self.assertEqual(away_segments[0]["start"], "1200.00")
        self.assertEqual(away_segments[0]["end"], "1134.00")

    def test_seed_players_without_clock_have_no_segments(self):
        processed = process_playbyplay_payload(
            game_id="seed-no-clock",
            actions=[],
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
            seed_home=["A. Starter"],
            seed_away=["B. Starter"],
            seed_clock=None,
            seed_period=1,
        )
        self.assertIn("A. Starter", processed["players"]["home"])
        self.assertIn("B. Starter", processed["players"]["away"])
        self.assertEqual(processed["segments"]["home"]["A. Starter"], [])
        self.assertEqual(processed["segments"]["away"]["B. Starter"], [])

    def test_off_court_technical_foul_does_not_start_segment(self):
        actions = [
            {
                "actionNumber": 0,
                "actionId": 0,
                "clock": "PT12M00.00S",
                "period": 3,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 101,
                "playerName": "Brown",
                "playerNameI": "J. Brown",
                "description": "SUB in: J. Brown",
                "actionType": "substitution",
                "subType": "in",
                "scoreHome": "50",
                "scoreAway": "50",
            },
            {
                "actionNumber": 1,
                "actionId": 1,
                "clock": "PT05M00.00S",
                "period": 3,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 101,
                "playerName": "Brown",
                "playerNameI": "J. Brown",
                "description": "SUB out: J. Brown",
                "actionType": "substitution",
                "subType": "out",
                "scoreHome": "50",
                "scoreAway": "50",
            },
            {
                "actionNumber": 2,
                "actionId": 2,
                "clock": "PT05M00.00S",
                "period": 3,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 101,
                "playerName": "Brown",
                "playerNameI": "J. Brown",
                "description": "J. Brown technical FOUL (1 Tech)",
                "actionType": "foul",
                "subType": "technical",
                "scoreHome": "50",
                "scoreAway": "50",
            },
        ]
        processed = process_playbyplay_payload(
            game_id="off-court-tech",
            actions=actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )
        brown_segments = processed["segments"]["away"].get("J. Brown") or []
        self.assertEqual(len(brown_segments), 1)
        self.assertEqual(brown_segments[0]["start"], "1200.00")
        self.assertEqual(brown_segments[0]["end"], "0500.00")

    def test_off_court_ejection_does_not_start_segment(self):
        actions = [
            {
                "actionNumber": 0,
                "actionId": 0,
                "clock": "PT12M00.00S",
                "period": 3,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 101,
                "playerName": "Brown",
                "playerNameI": "J. Brown",
                "description": "SUB in: J. Brown",
                "actionType": "substitution",
                "subType": "in",
                "scoreHome": "50",
                "scoreAway": "50",
            },
            {
                "actionNumber": 1,
                "actionId": 1,
                "clock": "PT05M00.00S",
                "period": 3,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 101,
                "playerName": "Brown",
                "playerNameI": "J. Brown",
                "description": "SUB out: J. Brown",
                "actionType": "substitution",
                "subType": "out",
                "scoreHome": "50",
                "scoreAway": "50",
            },
            {
                "actionNumber": 2,
                "actionId": 2,
                "clock": "PT05M00.00S",
                "period": 3,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 101,
                "playerName": "Brown",
                "playerNameI": "J. Brown",
                "description": "Ejection J. Brown",
                "actionType": "ejection",
                "subType": "other",
                "scoreHome": "50",
                "scoreAway": "50",
            },
        ]
        processed = process_playbyplay_payload(
            game_id="off-court-ejection",
            actions=actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )
        brown_segments = processed["segments"]["away"].get("J. Brown") or []
        self.assertEqual(len(brown_segments), 1)
        self.assertEqual(brown_segments[0]["start"], "1200.00")
        self.assertEqual(brown_segments[0]["end"], "0500.00")

    def test_off_court_personal_foul_does_not_create_sixth_player(self):
        actions = [
            {
                "actionNumber": 1,
                "actionId": 1,
                "clock": "PT12M00.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 201,
                "playerName": "One",
                "playerNameI": "P. One",
                "description": "SUB in: P. One",
                "actionType": "substitution",
                "subType": "in",
                "qualifiers": ["startperiod"],
            },
            {
                "actionNumber": 2,
                "actionId": 2,
                "clock": "PT12M00.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 202,
                "playerName": "Two",
                "playerNameI": "P. Two",
                "description": "SUB in: P. Two",
                "actionType": "substitution",
                "subType": "in",
                "qualifiers": ["startperiod"],
            },
            {
                "actionNumber": 3,
                "actionId": 3,
                "clock": "PT12M00.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 203,
                "playerName": "Three",
                "playerNameI": "P. Three",
                "description": "SUB in: P. Three",
                "actionType": "substitution",
                "subType": "in",
                "qualifiers": ["startperiod"],
            },
            {
                "actionNumber": 4,
                "actionId": 4,
                "clock": "PT12M00.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 204,
                "playerName": "Four",
                "playerNameI": "P. Four",
                "description": "SUB in: P. Four",
                "actionType": "substitution",
                "subType": "in",
                "qualifiers": ["startperiod"],
            },
            {
                "actionNumber": 5,
                "actionId": 5,
                "clock": "PT12M00.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 205,
                "playerName": "Five",
                "playerNameI": "P. Five",
                "description": "SUB in: P. Five",
                "actionType": "substitution",
                "subType": "in",
                "qualifiers": ["startperiod"],
            },
            {
                "actionNumber": 6,
                "actionId": 6,
                "clock": "PT10M00.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 205,
                "playerName": "Five",
                "playerNameI": "P. Five",
                "description": "SUB out: P. Five",
                "actionType": "substitution",
                "subType": "out",
            },
            {
                "actionNumber": 7,
                "actionId": 7,
                "clock": "PT10M00.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 206,
                "playerName": "Six",
                "playerNameI": "P. Six",
                "description": "SUB in: P. Six",
                "actionType": "substitution",
                "subType": "in",
            },
            {
                "actionNumber": 8,
                "actionId": 8,
                "clock": "PT09M59.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 205,
                "playerName": "Five",
                "playerNameI": "P. Five",
                "description": "P. Five personal FOUL (2 PF)",
                "actionType": "foul",
                "subType": "personal",
            },
        ]
        processed = process_playbyplay_payload(
            game_id="off-court-foul-cap",
            actions=actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )

        five_segments = processed["segments"]["away"].get("P. Five") or []
        self.assertEqual(len(five_segments), 1)
        self.assertEqual(five_segments[0]["start"], "1200.00")
        self.assertEqual(five_segments[0]["end"], "1000.00")

        away_segments = processed["segments"]["away"]
        boundaries = set()
        for segments in away_segments.values():
            for seg in segments or []:
                boundaries.add(time_to_seconds(seg.get("start")))
                boundaries.add(time_to_seconds(seg.get("end")))
        sorted_boundaries = sorted((b for b in boundaries if b is not None), reverse=True)
        max_on = 0
        for idx in range(len(sorted_boundaries) - 1):
            start = sorted_boundaries[idx]
            end = sorted_boundaries[idx + 1]
            if start <= end:
                continue
            on_count = 0
            for segments in away_segments.values():
                is_on = any(
                    time_to_seconds(seg.get("start")) >= start
                    and time_to_seconds(seg.get("end")) <= end
                    for seg in (segments or [])
                )
                if is_on:
                    on_count += 1
            max_on = max(max_on, on_count)

        self.assertEqual(max_on, 5)

    def test_carryover_player_stays_on_next_period(self):
        actions = [
            {
                "actionNumber": 1,
                "actionId": 1,
                "orderNumber": 1000,
                "clock": "PT01M00.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 500,
                "playerName": "Carry",
                "playerNameI": "C. Carry",
                "description": "C. Carry 2PT Shot",
                "actionType": "2pt",
                "subType": "Jump Shot",
                "scoreHome": "0",
                "scoreAway": "2",
            },
            {
                "actionNumber": 2,
                "actionId": 2,
                "orderNumber": 2000,
                "clock": "PT11M50.00S",
                "period": 2,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 501,
                "playerName": "Other",
                "playerNameI": "O. Other",
                "description": "O. Other 2PT Shot",
                "actionType": "2pt",
                "subType": "Jump Shot",
                "scoreHome": "0",
                "scoreAway": "4",
            },
            {
                "actionNumber": 3,
                "actionId": 3,
                "orderNumber": 3000,
                "clock": "PT11M50.00S",
                "period": 3,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 501,
                "playerName": "Other",
                "playerNameI": "O. Other",
                "description": "O. Other 2PT Shot",
                "actionType": "2pt",
                "subType": "Jump Shot",
                "scoreHome": "0",
                "scoreAway": "6",
            },
        ]
        processed = process_playbyplay_payload(
            game_id="carryover-test",
            actions=actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )
        carry_segments = processed["segments"]["away"].get("C. Carry") or []
        q2_segments = [s for s in carry_segments if s.get("quarter") == 2]
        self.assertEqual(len(q2_segments), 1)
        self.assertEqual(q2_segments[0]["start"], "1200.00")
        self.assertEqual(q2_segments[0]["end"], "0000.00")

    def test_players_with_same_initial_last_name_do_not_merge(self):
        actions = [
            {
                "actionNumber": 1,
                "actionId": 1,
                "clock": "PT11M50.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 1631114,
                "playerName": "Williams",
                "playerNameI": "J. Williams",
                "description": "J. Williams 2PT Jump Shot",
                "actionType": "2pt",
                "subType": "Jump Shot",
                "scoreHome": "0",
                "scoreAway": "2",
            },
            {
                "actionNumber": 2,
                "actionId": 2,
                "clock": "PT11M40.00S",
                "period": 1,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 1631119,
                "playerName": "Williams",
                "playerNameI": "J. Williams",
                "description": "J. Williams 2PT Jump Shot",
                "actionType": "2pt",
                "subType": "Jump Shot",
                "scoreHome": "0",
                "scoreAway": "4",
            },
        ]

        processed = process_playbyplay_payload(
            game_id="same-initials-test",
            actions=actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
            away_player_labels={
                1631114: "Jalen Williams",
                1631119: "Jaylin Williams",
            },
        )

        away_players = processed["players"]["away"]
        away_segments = processed["segments"]["away"]

        self.assertIn("Jalen Williams", away_players)
        self.assertIn("Jaylin Williams", away_players)
        self.assertIn("Jalen Williams", away_segments)
        self.assertIn("Jaylin Williams", away_segments)
        self.assertEqual(len(away_players), 2)

    def test_target_score_games_use_single_period_without_synthetic_segments(self):
        actions = [
            {
                "actionNumber": 2,
                "actionId": 2,
                "orderNumber": 1000,
                "clock": "PT00M00.00S",
                "timeActual": "2026-02-14T02:00:00.000Z",
                "period": 1,
                "isTargetScoreLastPeriod": True,
                "teamId": int(self.away_team_id),
                "teamTricode": "NOP",
                "personId": 1001,
                "playerName": "Away",
                "playerNameI": "A. Away",
                "description": "A. Away 2PT Jump Shot",
                "actionType": "2pt",
                "subType": "Jump Shot",
                "scoreHome": "0",
                "scoreAway": "2",
            },
            {
                "actionNumber": 3,
                "actionId": 3,
                "orderNumber": 2000,
                "clock": "PT00M00.00S",
                "timeActual": "2026-02-14T02:10:00.000Z",
                "period": 1,
                "isTargetScoreLastPeriod": True,
                "teamId": int(self.home_team_id),
                "teamTricode": "SAS",
                "personId": 2001,
                "playerName": "Home",
                "playerNameI": "H. Home",
                "description": "H. Home 2PT Jump Shot",
                "actionType": "2pt",
                "subType": "Jump Shot",
                "scoreHome": "2",
                "scoreAway": "2",
            },
        ]

        processed = process_playbyplay_payload(
            game_id="target-score-test",
            actions=actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
            seed_home=["Starter"],
            seed_away=["Starter"],
            seed_clock="PT00M00.00S",
            seed_period=1,
        )

        self.assertEqual(processed["periods"], 1)
        self.assertEqual(processed["last"]["quarter"], 1)
        self.assertEqual(processed["last"]["time"], "000.00")
        self.assertEqual(processed["last"]["seq"], 3)
        self.assertEqual(processed["score"][0]["time"], "1200.00")
        self.assertEqual(processed["score"][-1]["time"], "000.00")

        action_times = set()
        for team_key in ("away", "home"):
            for actions_for_player in processed["players"][team_key].values():
                for action in actions_for_player:
                    action_times.add(action.get("time"))
        self.assertGreater(len(action_times), 1)

        all_segments = []
        for team_key in ("away", "home"):
            for segments in processed["segments"][team_key].values():
                all_segments.extend(segments or [])
        self.assertGreater(len(all_segments), 0)
