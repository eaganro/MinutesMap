locals {
  src_ws_join_date      = "${path.module}/../functions/ws-joinDate-handler"
  src_ws_send_update    = "${path.module}/../functions/ws-sendGameUpdate-handler"
  src_ws_disconnect     = "${path.module}/../functions/ws-disconnect-handler"
  src_game_date_updates = "${path.module}/../functions/gameDateUpdates"
  src_ws_join_game      = "${path.module}/../functions/ws-joinGame-handler"
  src_fetch_scoreboard  = "${path.module}/../functions/FetchTodaysScoreboard"
  src_nba_poller        = "${path.module}/../functions/nba-game-poller"
  
  # Where to store temporary build artifacts
  build_dir = "${path.module}/build_artifacts"
}
