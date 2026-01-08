# --- Function: ws-unfollowGame-handler ---

# --- 1. IAM Permissions for ws-unfollowGame-handler ---
data "aws_iam_policy_document" "ws_unfollow_game_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ws_unfollow_game_role" {
  name               = "ws-unfollowGame-handler-role"
  assume_role_policy = data.aws_iam_policy_document.ws_unfollow_game_trust.json
}

resource "aws_iam_role_policy_attachment" "ws_unfollow_game_logs" {
  role       = aws_iam_role.ws_unfollow_game_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ws_unfollow_game_dynamo" {
  name = "ws_unfollow_game_dynamo"
  role = aws_iam_role.ws_unfollow_game_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:DeleteItem"]
        Resource = aws_dynamodb_table.game_connections.arn
      }
    ]
  })
}

# --- 2. Lambda Function ---
data "archive_file" "zip_ws_unfollow_game" {
  type        = "zip"
  source_dir  = local.src_ws_unfollow_game
  output_path = "${local.build_dir}/ws-unfollowGame-handler.zip"
}

resource "aws_lambda_function" "ws_unfollow_game" {
  function_name = "ws-unfollowGame-handler"
  role          = aws_iam_role.ws_unfollow_game_role.arn
  handler       = "lambda_function.handler"
  runtime       = "python3.12"

  filename         = data.archive_file.zip_ws_unfollow_game.output_path
  source_code_hash = data.archive_file.zip_ws_unfollow_game.output_base64sha256

  environment {
    variables = {
      GAME_CONN_TABLE = aws_dynamodb_table.game_connections.name
    }
  }
}
