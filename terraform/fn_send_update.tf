# --- Function 2: ws-sendGameUpdate-handler ---

# --- 1. IAM Permissions for ws-sendGameUpdate-handler ---

# A. The Trust Policy
data "aws_iam_policy_document" "ws_send_update_trust" {
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
resource "aws_iam_role" "ws_send_update_role" {
  name               = "ws-sendGameUpdate-handler-role"
  assume_role_policy = data.aws_iam_policy_document.ws_send_update_trust.json
}

# C. Basic Logging
resource "aws_iam_role_policy_attachment" "ws_send_update_logs" {
  role       = aws_iam_role.ws_send_update_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# D. DynamoDB Access (Query GSI + Delete Stale)
resource "aws_iam_role_policy" "ws_send_update_dynamo" {
  name = "dynamodb_access"
  role = aws_iam_role.ws_send_update_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query"
        ]
        # Must allow access specifically to the Index used in the Python code
        Resource = [
          aws_dynamodb_table.game_connections.arn,
          "${aws_dynamodb_table.game_connections.arn}/index/gameId-index"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DeleteItem"
        ]
        # Deletion happens on the main table
        Resource = aws_dynamodb_table.game_connections.arn
      }
    ]
  })
}

# E. API Gateway Access (Sending messages)
resource "aws_iam_role_policy" "ws_send_update_apigateway" {
  name = "apigateway_manage_connections"
  role = aws_iam_role.ws_send_update_role.id

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

data "archive_file" "zip_ws_send_update" {
  type        = "zip"
  source_dir  = local.src_ws_send_update
  output_path = "${local.build_dir}/ws-sendGameUpdate-handler.zip"
}

resource "aws_lambda_function" "ws_send_update" {
  function_name = "ws-sendGameUpdate-handler"
  
  role          = aws_iam_role.ws_send_update_role.arn
  
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

# --- 3. S3 Trigger Permission (Crucial!) ---


resource "aws_lambda_permission" "allow_s3_trigger" {
  statement_id  = "AllowExecutionFromS3"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_send_update.function_name
  principal     = "s3.amazonaws.com"

  source_arn    = aws_s3_bucket.data_bucket.arn 
}