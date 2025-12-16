# --- Function 5: ws-joinGame-handler ---

# --- 1. IAM Permissions for ws-joinGame-handler ---

# A. The Trust Policy
data "aws_iam_policy_document" "ws_join_game_trust" {
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
resource "aws_iam_role" "ws_join_game_role" {
  name               = "ws-joinGame-handler-role"
  assume_role_policy = data.aws_iam_policy_document.ws_join_game_trust.json
}

# C. Basic Logging Permissions (Managed Policy)
resource "aws_iam_role_policy_attachment" "ws_join_game_logs" {
  role       = aws_iam_role.ws_join_game_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# D. DynamoDB Write Permissions
resource "aws_iam_role_policy" "ws_join_game_dynamo" {
  name = "dynamodb_write_access"
  role = aws_iam_role.ws_join_game_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem"
        ]
        Resource = aws_dynamodb_table.game_connections.arn
      }
    ]
  })
}

# --- 2. The Lambda Function ---

data "archive_file" "zip_ws_join_game" {
  type        = "zip"
  source_dir  = local.src_ws_join_game
  output_path = "${local.build_dir}/ws-joinGame-handler.zip"
}

resource "aws_lambda_function" "ws_join_game" {
  function_name = "ws-joinGame-handler"
  
  # Connect the new role
  role          = aws_iam_role.ws_join_game_role.arn
  
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
  publish       = false

  filename         = data.archive_file.zip_ws_join_game.output_path
  source_code_hash = data.archive_file.zip_ws_join_game.output_base64sha256

  environment {
    variables = {
      CONNECTIONS_TABLE = aws_dynamodb_table.game_connections.name
    }
  }
}