# backend.tf

# ---------------------------------------------------------
# API GATEWAY (WebSocket)
# ---------------------------------------------------------
resource "aws_apigatewayv2_api" "websocket_api" {
  name                       = "basketballStats"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

# =========================================================
# LAMBDA BUILD & DEPLOYMENT CONFIGURATION
# =========================================================

locals {
  src_ws_join_date      = "${path.module}/../functions/ws-joinDate-handler"
  src_ws_send_update    = "${path.module}/../functions/ws-sendGameUpdate-handler"
  src_ws_disconnect     = "${path.module}/../functions/ws-disconnect-handler"
  src_game_date_updates = "${path.module}/../functions/gameDateUpdates"
  src_ws_join_game      = "${path.module}/../functions/ws-joinGame-handler"
  src_fetch_scoreboard  = "${path.module}/../functions/FetchTodaysScoreboard"
  
  # Where to store temporary build artifacts
  build_dir = "${path.module}/build_artifacts"
}


# --- Function 1: ws-joinDate-handler ---

# 1. Build (npm install) only if package.json changes
resource "null_resource" "build_ws_join_date" {
  triggers = {
    package_json = filemd5("${local.src_ws_join_date}/package.json")
  }
  provisioner "local-exec" {
    command = "cd ${local.src_ws_join_date} && npm install --production"
  }
}

# 2. Zip the directory
data "archive_file" "zip_ws_join_date" {
  type        = "zip"
  source_dir  = local.src_ws_join_date
  output_path = "${local.build_dir}/ws-joinDate-handler.zip"
  depends_on  = [null_resource.build_ws_join_date]
}

# 3. The AWS Resource
resource "aws_lambda_function" "ws_join_date" {
  function_name = "ws-joinDate-handler"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/ws-joinDate-handler-role-rv947zq3"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  publish       = false

  # POINT TO THE DYNAMIC ZIP FILE
  filename         = data.archive_file.zip_ws_join_date.output_path
  source_code_hash = data.archive_file.zip_ws_join_date.output_base64sha256

  environment {
    variables = {
      WS_API_ENDPOINT = "${replace(aws_apigatewayv2_api.websocket_api.api_endpoint, "wss://", "https://")}/production"
    }
  }
}


# --- Function 2: ws-sendGameUpdate-handler ---

resource "null_resource" "build_ws_send_update" {
  triggers = {
    package_json = filemd5("${local.src_ws_send_update}/package.json")
  }
  provisioner "local-exec" {
    command = "cd ${local.src_ws_send_update} && npm install --production"
  }
}

data "archive_file" "zip_ws_send_update" {
  type        = "zip"
  source_dir  = local.src_ws_send_update
  output_path = "${local.build_dir}/ws-sendGameUpdate-handler.zip"
  depends_on  = [null_resource.build_ws_send_update]
}

resource "aws_lambda_function" "ws_send_update" {
  function_name = "ws-sendGameUpdate-handler"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/ws-sendGameUpdate-handler-role-35xi2g86"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  publish       = false

  filename         = data.archive_file.zip_ws_send_update.output_path
  source_code_hash = data.archive_file.zip_ws_send_update.output_base64sha256

  environment {
    variables = {
      CONN_TABLE      = aws_dynamodb_table.game_connections.name
      WS_API_ENDPOINT = "${replace(aws_apigatewayv2_api.websocket_api.api_endpoint, "wss://", "https://")}/production"
    }
  }
}


# --- Function 3: ws-disconnect-handler ---

resource "null_resource" "build_ws_disconnect" {
  triggers = {
    package_json = filemd5("${local.src_ws_disconnect}/package.json")
  }
  provisioner "local-exec" {
    command = "cd ${local.src_ws_disconnect} && npm install --production"
  }
}

data "archive_file" "zip_ws_disconnect" {
  type        = "zip"
  source_dir  = local.src_ws_disconnect
  output_path = "${local.build_dir}/ws-disconnect-handler.zip"
  depends_on  = [null_resource.build_ws_disconnect]
}

resource "aws_lambda_function" "ws_disconnect" {
  function_name = "ws-disconnect-handler"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/ws-disconnect-handler-role-wtkmi22f"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  publish       = false

  filename         = data.archive_file.zip_ws_disconnect.output_path
  source_code_hash = data.archive_file.zip_ws_disconnect.output_base64sha256
}


# --- Function 4: gameDateUpdates ---

resource "null_resource" "build_game_date_updates" {
  triggers = {
    package_json = filemd5("${local.src_game_date_updates}/package.json")
  }
  provisioner "local-exec" {
    command = "cd ${local.src_game_date_updates} && npm install --production"
  }
}

data "archive_file" "zip_game_date_updates" {
  type        = "zip"
  source_dir  = local.src_game_date_updates
  output_path = "${local.build_dir}/gameDateUpdates.zip"
  depends_on  = [null_resource.build_game_date_updates]
}

resource "aws_lambda_function" "game_date_updates" {
  function_name = "gameDateUpdates"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/gameDateUpdates-role-jwv747j7"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  publish       = false

  filename         = data.archive_file.zip_game_date_updates.output_path
  source_code_hash = data.archive_file.zip_game_date_updates.output_base64sha256

  environment {
    variables = {
      DATE_CONN_TABLE = aws_dynamodb_table.date_connections.name
      DATE_INDEX_NAME = "date-index"
      GAMES_GSI       = "ByDate"
      GAMES_TABLE     = aws_dynamodb_table.nba_games.name
      WS_API_ENDPOINT = "${replace(aws_apigatewayv2_api.websocket_api.api_endpoint, "wss://", "https://")}/production"
    }
  }
}


# --- Function 5: ws-joinGame-handler ---

resource "null_resource" "build_ws_join_game" {
  triggers = {
    package_json = filemd5("${local.src_ws_join_game}/package.json")
  }
  provisioner "local-exec" {
    command = "cd ${local.src_ws_join_game} && npm install --production"
  }
}

data "archive_file" "zip_ws_join_game" {
  type        = "zip"
  source_dir  = local.src_ws_join_game
  output_path = "${local.build_dir}/ws-joinGame-handler.zip"
  depends_on  = [null_resource.build_ws_join_game]
}

resource "aws_lambda_function" "ws_join_game" {
  function_name = "ws-joinGame-handler"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/ws-joinGame-handler-role-f5dhkdmc"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  publish       = false

  filename         = data.archive_file.zip_ws_join_game.output_path
  source_code_hash = data.archive_file.zip_ws_join_game.output_base64sha256
}


# --- Function 6: FetchTodaysScoreboard ---

resource "null_resource" "build_fetch_scoreboard" {
  triggers = {
    package_json = filemd5("${local.src_fetch_scoreboard}/package.json")
  }
  provisioner "local-exec" {
    command = "cd ${local.src_fetch_scoreboard} && npm install --production"
  }
}

data "archive_file" "zip_fetch_scoreboard" {
  type        = "zip"
  source_dir  = local.src_fetch_scoreboard
  output_path = "${local.build_dir}/FetchTodaysScoreboard.zip"
  depends_on  = [null_resource.build_fetch_scoreboard]
}

resource "aws_lambda_function" "fetch_scoreboard" {
  function_name = "FetchTodaysScoreboard"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/FetchTodaysScoreboard-role-vyrjnget"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  publish       = false

  filename         = data.archive_file.zip_fetch_scoreboard.output_path
  source_code_hash = data.archive_file.zip_fetch_scoreboard.output_base64sha256

  environment {
    variables = {
      GAMES_TABLE = aws_dynamodb_table.nba_games.name
    }
  }
}