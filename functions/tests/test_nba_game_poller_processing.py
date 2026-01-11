import json
import os
import unittest
from datetime import datetime
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

        self.assertEqual(processed["schemaVersion"], 1)
        self.assertEqual(processed["gameId"], "0012200039")
        self.assertIsInstance(processed["generatedAt"], str)
        datetime.fromisoformat(processed["generatedAt"].replace("Z", "+00:00"))

        self.assertEqual(processed["awayTeamId"], int(self.away_team_id))
        self.assertEqual(processed["homeTeamId"], int(self.home_team_id))
        self.assertEqual(processed["numPeriods"], 4)

        self.assertIsInstance(processed["actions"], list)
        self.assertEqual(len(processed["actions"]), len(self.actions))

        self.assertIsInstance(processed["scoreTimeline"], list)
        self.assertIsInstance(processed["awayActions"], dict)
        self.assertIsInstance(processed["homeActions"], dict)
        self.assertIsInstance(processed["awayPlayerTimeline"], dict)
        self.assertIsInstance(processed["homePlayerTimeline"], dict)
        self.assertIsInstance(processed["allActions"], list)

    def test_score_timeline_final_score_present(self):
        processed = process_playbyplay_payload(
            game_id="0012200039",
            actions=self.actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )
        self.assertGreater(len(processed["scoreTimeline"]), 0)

        last = processed["scoreTimeline"][-1]
        self.assertEqual(last["away"], "111")
        self.assertEqual(last["home"], "97")
        self.assertEqual(last["period"], 4)

    def test_assist_actions_are_injected(self):
        processed = process_playbyplay_payload(
            game_id="0012200039",
            actions=self.actions,
            away_team_id=self.away_team_id,
            home_team_id=self.home_team_id,
        )

        # In the fixture: "Murphy III ... (Jones 1 AST)" at actionNumber 11, NOP.
        away_jones = processed["awayActions"].get("Jones") or []
        self.assertTrue(
            any(a.get("actionType") == "Assist" and a.get("actionNumber") == "11a" for a in away_jones),
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
        helper_timeline = processed["awayPlayerTimeline"].get("A. Helper")
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
        all_actions = processed["allActions"]
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

        timelines = [processed["awayPlayerTimeline"], processed["homePlayerTimeline"]]
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
