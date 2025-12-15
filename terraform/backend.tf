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

# Zip the directory
data "archive_file" "zip_ws_join_date" {
  type        = "zip"
  source_dir  = local.src_ws_join_date
  output_path = "${local.build_dir}/ws-joinDate-handler.zip"
}

# The AWS Resource
resource "aws_lambda_function" "ws_join_date" {
  function_name = "ws-joinDate-handler"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/ws-joinDate-handler-role-rv947zq3"
  
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
  publish       = false

  filename         = data.archive_file.zip_ws_join_date.output_path
  source_code_hash = data.archive_file.zip_ws_join_date.output_base64sha256

  environment {
    variables = {
      WS_API_ENDPOINT = "${replace(aws_apigatewayv2_api.websocket_api.api_endpoint, "wss://", "https://")}/production"
    }
  }
}


# --- Function 2: ws-sendGameUpdate-handler ---

# 1. Zip the source directory directly
data "archive_file" "zip_ws_send_update" {
  type        = "zip"
  source_dir  = local.src_ws_send_update
  output_path = "${local.build_dir}/ws-sendGameUpdate-handler.zip"
}

# 2. AWS Resource
resource "aws_lambda_function" "ws_send_update" {
  function_name = "ws-sendGameUpdate-handler"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/ws-sendGameUpdate-handler-role-35xi2g86"
  
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
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

# Zip the source directory directly
data "archive_file" "zip_ws_disconnect" {
  type        = "zip"
  source_dir  = local.src_ws_disconnect
  output_path = "${local.build_dir}/ws-disconnect-handler.zip"
}

# The AWS Resource
resource "aws_lambda_function" "ws_disconnect" {
  function_name = "ws-disconnect-handler"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/ws-disconnect-handler-role-wtkmi22f"
  
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
  publish       = false

  filename         = data.archive_file.zip_ws_disconnect.output_path
  source_code_hash = data.archive_file.zip_ws_disconnect.output_base64sha256
}


# --- Function 4: gameDateUpdates ---

# Zip the source directory directly
data "archive_file" "zip_game_date_updates" {
  type        = "zip"
  source_dir  = local.src_game_date_updates
  output_path = "${local.build_dir}/gameDateUpdates.zip"
}

# AWS Resource
resource "aws_lambda_function" "game_date_updates" {
  function_name = "gameDateUpdates"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/gameDateUpdates-role-jwv747j7"
  
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
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

data "archive_file" "zip_ws_join_game" {
  type        = "zip"
  source_dir  = local.src_ws_join_game
  output_path = "${local.build_dir}/ws-joinGame-handler.zip"
}

resource "aws_lambda_function" "ws_join_game" {
  function_name = "ws-joinGame-handler"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/ws-joinGame-handler-role-f5dhkdmc"
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
  publish       = false

  filename         = data.archive_file.zip_ws_join_game.output_path
  source_code_hash = data.archive_file.zip_ws_join_game.output_base64sha256
}


# --- Function 6: FetchTodaysScoreboard ---

resource "null_resource" "build_fetch_scoreboard" {
  triggers = {
    requirements = filemd5("${local.src_fetch_scoreboard}/requirements.txt")
    source_code  = filemd5("${local.src_fetch_scoreboard}/lambda_function.py")
  }

  provisioner "local-exec" {
    command = <<EOT
      rm -rf ${local.src_fetch_scoreboard}/build
      mkdir -p ${local.src_fetch_scoreboard}/build
      pip install -r ${local.src_fetch_scoreboard}/requirements.txt -t ${local.src_fetch_scoreboard}/build
      cp ${local.src_fetch_scoreboard}/lambda_function.py ${local.src_fetch_scoreboard}/build/
    EOT
  }
}

data "archive_file" "zip_fetch_scoreboard" {
  type        = "zip"
  
  source_dir  = "${local.src_fetch_scoreboard}/build"
  output_path = "${local.build_dir}/FetchTodaysScoreboard.zip"
  depends_on  = [null_resource.build_fetch_scoreboard]
}

resource "aws_lambda_function" "fetch_scoreboard" {
  function_name = "FetchTodaysScoreboard"
  role          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/service-role/FetchTodaysScoreboard-role-vyrjnget"
  
  handler       = "lambda_function.handler" 
  runtime       = "python3.11"
  publish       = false

  filename         = data.archive_file.zip_fetch_scoreboard.output_path
  source_code_hash = data.archive_file.zip_fetch_scoreboard.output_base64sha256

  environment {
    variables = {
      GAMES_TABLE = aws_dynamodb_table.nba_games.name
    }
  }
}