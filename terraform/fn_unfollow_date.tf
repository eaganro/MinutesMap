# --- Function: ws-unfollowDate-handler ---

# --- 1. IAM Permissions for ws-unfollowDate-handler ---
data "aws_iam_policy_document" "ws_unfollow_date_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ws_unfollow_date_role" {
  name               = "ws-unfollowDate-handler-role"
  assume_role_policy = data.aws_iam_policy_document.ws_unfollow_date_trust.json
}

resource "aws_iam_role_policy_attachment" "ws_unfollow_date_logs" {
  role       = aws_iam_role.ws_unfollow_date_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ws_unfollow_date_dynamo" {
  name = "ws_unfollow_date_dynamo"
  role = aws_iam_role.ws_unfollow_date_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:DeleteItem"]
        Resource = aws_dynamodb_table.date_connections.arn
      }
    ]
  })
}

# --- 2. Lambda Function ---
data "archive_file" "zip_ws_unfollow_date" {
  type        = "zip"
  source_dir  = local.src_ws_unfollow_date
  output_path = "${local.build_dir}/ws-unfollowDate-handler.zip"
}

resource "aws_lambda_function" "ws_unfollow_date" {
  function_name = "ws-unfollowDate-handler"
  role          = aws_iam_role.ws_unfollow_date_role.arn
  handler       = "lambda_function.handler"
  runtime       = "python3.12"

  filename         = data.archive_file.zip_ws_unfollow_date.output_path
  source_code_hash = data.archive_file.zip_ws_unfollow_date.output_base64sha256

  environment {
    variables = {
      DATE_CONN_TABLE = aws_dynamodb_table.date_connections.name
    }
  }
}
