# --- Function 4: gameDateUpdates ---

# --- 1. IAM Permissions for gameDateUpdates ---

# A. The Trust Policy
data "aws_iam_policy_document" "game_date_updates_trust" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

# B. The Role
resource "aws_iam_role" "game_date_updates_role" {
  name               = "gameDateUpdates-role"
  assume_role_policy = data.aws_iam_policy_document.game_date_updates_trust.json
}

# C. Basic Logging
resource "aws_iam_role_policy_attachment" "game_date_updates_logs" {
  role       = aws_iam_role.game_date_updates_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# D. DynamoDB Data Access (Querying and Deleting)
resource "aws_iam_role_policy" "game_date_updates_dynamo_data" {
  name = "dynamodb_data_access"
  role = aws_iam_role.game_date_updates_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem"
        ]
        # Needs access to the tables AND their indexes (GSIs)
        Resource = [
          aws_dynamodb_table.nba_games.arn,
          "${aws_dynamodb_table.nba_games.arn}/index/*",
          aws_dynamodb_table.date_connections.arn,
          "${aws_dynamodb_table.date_connections.arn}/index/*"
        ]
      },
      {
        # Permission to delete stale connections
        Effect   = "Allow"
        Action   = ["dynamodb:DeleteItem"]
        Resource = aws_dynamodb_table.date_connections.arn
      }
    ]
  })
}

# E. DynamoDB Stream Access (Reading the trigger)
resource "aws_iam_role_policy" "game_date_updates_stream" {
  name = "dynamodb_stream_access"
  role = aws_iam_role.game_date_updates_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:DescribeStream",
          "dynamodb:ListStreams"
        ]
        Resource = aws_dynamodb_table.nba_games.stream_arn
      }
    ]
  })
}

# F. API Gateway Access (Sending messages to clients)
resource "aws_iam_role_policy" "game_date_updates_apigateway" {
  name = "apigateway_manage_connections"
  role = aws_iam_role.game_date_updates_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "${aws_apigatewayv2_api.websocket_api.execution_arn}/*"
      }
    ]
  })
}

# --- 2. The Lambda Function ---

data "archive_file" "zip_game_date_updates" {
  type        = "zip"
  source_dir  = local.src_game_date_updates
  output_path = "${local.build_dir}/gameDateUpdates.zip"
}

resource "aws_lambda_function" "game_date_updates" {
  function_name = "gameDateUpdates"
  
  role          = aws_iam_role.game_date_updates_role.arn
  
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

# --- 3. The Trigger (Event Source Mapping) ---

resource "aws_lambda_event_source_mapping" "nba_games_stream_trigger" {
  # The source of the data (The DynamoDB Stream)
  event_source_arn  = aws_dynamodb_table.nba_games.stream_arn
  
  # The destination
  function_name     = aws_lambda_function.game_date_updates.arn
  
  # LATEST = Only process new data that arrives after this trigger is created.
  starting_position = "LATEST"

  batch_size        = 10

  maximum_retry_attempts = 1
}