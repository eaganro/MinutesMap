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
        self.assertEqual(processed["game"], "0012200039")
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
        self.assertEqual(last["period"], 4)

    def test_assist_actions_are_injected(self):
        processed = process_playbyplay_payload(
            game_id="0012200039",
            actions=self.actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )

        # In the fixture: "Murphy III ... (Jones 1 AST)" at actionNumber 11, NOP.
        away_jones = processed["players"]["away"].get("Jones") or []
        self.assertTrue(
            any(a.get("type") == "Assist" and a.get("seq") == "11a" for a in away_jones),
            "Expected injected assist action '11a' under away player 'Jones'",
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
        self.assertEqual(helper_timeline[0]["start"], "PT12M00.00S")
        self.assertEqual(helper_timeline[0]["end"], "PT11M10.00S")

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
            return (int(a.get("period") or 0), -time_to_seconds(a.get("clock")))

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
