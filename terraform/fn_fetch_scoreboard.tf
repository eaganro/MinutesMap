# --- Function 6: FetchTodaysScoreboard ---

# --- 1. IAM Permissions for FetchTodaysScoreboard ---

# A. The Trust Policy
data "aws_iam_policy_document" "fetch_scoreboard_trust" {
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
resource "aws_iam_role" "fetch_scoreboard_role" {
  name               = "FetchTodaysScoreboard-role"
  assume_role_policy = data.aws_iam_policy_document.fetch_scoreboard_trust.json
}

# C. Basic Logging Permissions (Managed Policy)
# This gives permission to create log groups and write logs to CloudWatch.
resource "aws_iam_role_policy_attachment" "fetch_scoreboard_logs" {
  role       = aws_iam_role.fetch_scoreboard_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# D. DynamoDB Write Permissions (Custom Policy)
resource "aws_iam_role_policy" "fetch_scoreboard_dynamo_write" {
  name = "dynamodb_write_access"
  role = aws_iam_role.fetch_scoreboard_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:BatchWriteItem",
          "dynamodb:PutItem"
        ]
        Resource = aws_dynamodb_table.nba_games.arn
      }
    ]
  })
}

# --- 2. The Lambda Function ---

data "archive_file" "zip_fetch_scoreboard" {
  type        = "zip"
  source_file = "${local.src_fetch_scoreboard}/lambda_function.py" 
  output_path = "${local.build_dir}/FetchTodaysScoreboard.zip"
}

resource "aws_lambda_function" "fetch_scoreboard" {
  function_name = "FetchTodaysScoreboard"
  
  # Connects the function to the new role we created above
  role          = aws_iam_role.fetch_scoreboard_role.arn
   
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