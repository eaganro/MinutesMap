# --- Function 3: ws-disconnect-handler ---

# --- 1. IAM Permissions for ws-disconnect-handler ---

# A. The Trust Policy
data "aws_iam_policy_document" "ws_disconnect_trust" {
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
resource "aws_iam_role" "ws_disconnect_role" {
  name               = "ws-disconnect-handler-role"
  assume_role_policy = data.aws_iam_policy_document.ws_disconnect_trust.json
}

# C. Basic Logging
resource "aws_iam_role_policy_attachment" "ws_disconnect_logs" {
  role       = aws_iam_role.ws_disconnect_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# D. DynamoDB Delete Permissions
resource "aws_iam_role_policy" "ws_disconnect_dynamo" {
  name = "dynamodb_delete_access"
  role = aws_iam_role.ws_disconnect_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DeleteItem"
        ]
        # This function needs to delete from BOTH connection tables
        Resource = [
          aws_dynamodb_table.game_connections.arn,
          aws_dynamodb_table.date_connections.arn
        ]
      }
    ]
  })
}

# --- 2. The Lambda Function ---

data "archive_file" "zip_ws_disconnect" {
  type        = "zip"
  source_dir  = local.src_ws_disconnect
  output_path = "${local.build_dir}/ws-disconnect-handler.zip"
}

resource "aws_lambda_function" "ws_disconnect" {
  function_name = "ws-disconnect-handler"

  role          = aws_iam_role.ws_disconnect_role.arn
  
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
  publish       = false

  filename         = data.archive_file.zip_ws_disconnect.output_path
  source_code_hash = data.archive_file.zip_ws_disconnect.output_base64sha256

  environment {
    variables = {
      GAME_CONN_TABLE = aws_dynamodb_table.game_connections.name
      DATE_CONN_TABLE = aws_dynamodb_table.date_connections.name
    }
  }
}