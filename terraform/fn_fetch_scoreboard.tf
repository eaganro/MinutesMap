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
  permissions_boundary = var.iam_boundary_arn
}

# C. Basic Logging Permissions (Managed Policy)
resource "aws_iam_role_policy_attachment" "fetch_scoreboard_logs" {
  role       = aws_iam_role.fetch_scoreboard_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# D. S3 Schedule Write Permissions (Custom Policy)
resource "aws_iam_role_policy" "fetch_scoreboard_s3_write" {
  name = "s3_schedule_write_access"
  role = aws_iam_role.fetch_scoreboard_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.data_bucket.arn}/schedule/*"
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
  
  role          = aws_iam_role.fetch_scoreboard_role.arn
   
  handler       = "lambda_function.handler" 
  runtime       = "python3.11"
  publish       = false

  filename         = data.archive_file.zip_fetch_scoreboard.output_path
  source_code_hash = data.archive_file.zip_fetch_scoreboard.output_base64sha256

  environment {
    variables = {
      DATA_BUCKET     = aws_s3_bucket.data_bucket.id
      SCHEDULE_PREFIX = "schedule/"
    }
  }
}
