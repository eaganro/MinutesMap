# --- Function 1: ws-joinDate-handler ---

# --- 1. IAM Permissions for ws-joinDate-handler ---

# A. The Trust Policy
data "aws_iam_policy_document" "ws_join_date_trust" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

# B. The Role Itself
resource "aws_iam_role" "ws_join_date_role" {
  name               = "ws-joinDate-handler-role"
  assume_role_policy = data.aws_iam_policy_document.ws_join_date_trust.json
}

# C. Basic Logging
resource "aws_iam_role_policy_attachment" "ws_join_date_logs" {
  role       = aws_iam_role.ws_join_date_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# D. DynamoDB Permissions (Read Games + Write Connection)
resource "aws_iam_role_policy" "ws_join_date_dynamo" {
  name = "dynamodb_access"
  role = aws_iam_role.ws_join_date_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Permission to register the user in DateConnections
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem"
        ]
        Resource = aws_dynamodb_table.date_connections.arn
      },
      {
        # Permission to look up games in NBA_Games using the ByDate index
        Effect = "Allow"
        Action = [
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.nba_games.arn,
          "${aws_dynamodb_table.nba_games.arn}/index/ByDate" # Explicitly allowing the index
        ]
      }
    ]
  })
}

# E. API Gateway Permissions (Reply to client)
resource "aws_iam_role_policy" "ws_join_date_apigateway" {
  name = "apigateway_manage_connections"
  role = aws_iam_role.ws_join_date_role.id

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

data "archive_file" "zip_ws_join_date" {
  type        = "zip"
  source_dir  = local.src_ws_join_date
  output_path = "${local.build_dir}/ws-joinDate-handler.zip"
}

resource "aws_lambda_function" "ws_join_date" {
  function_name = "ws-joinDate-handler"
  
  role          = aws_iam_role.ws_join_date_role.arn
  
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
  publish       = false

  filename         = data.archive_file.zip_ws_join_date.output_path
  source_code_hash = data.archive_file.zip_ws_join_date.output_base64sha256

  environment {
    variables = {
      DATE_CONN_TABLE = aws_dynamodb_table.date_connections.name
      GAMES_TABLE     = aws_dynamodb_table.nba_games.name
      GAMES_GSI       = "ByDate"
      WS_API_ENDPOINT = "${replace(aws_apigatewayv2_api.websocket_api.api_endpoint, "wss://", "https://")}/production"
    }
  }
}