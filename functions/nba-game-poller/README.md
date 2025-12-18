# nba-game-poller (tests)

## Run processing tests

From the repo root:

```bash
python3 -m unittest discover -s functions/nba-game-poller/tests -p "test_*.py"
```

These tests validate the play-by-play processing output produced by `nba_game_poller.playbyplay_processing.process_playbyplay_payload` using `0012200039.json` as a fixture.

