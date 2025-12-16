# --- Function 7: NBA Game Poller & Manager ---


# --- 1. IAM Roles & Permissions ---

# A. Role for the Lambda itself
resource "aws_iam_role" "nba_poller_role" {
  name = "nba-poller-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# B. Role for the EventBridge Scheduler
# The Lambda passes this role to the Scheduler so the Scheduler can call the Lambda back later.
resource "aws_iam_role" "nba_scheduler_role" {
  name = "nba-poller-scheduler-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

# C. Policy for the Lambda
resource "aws_iam_role_policy" "nba_poller_policy" {
  name = "nba-poller-policy"
  role = aws_iam_role.nba_poller_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # 1. Logging
      {
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      },
      # 2. DynamoDB Access
      {
        Action   = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
        Effect   = "Allow"
        Resource = [
            aws_dynamodb_table.nba_games.arn,
            "${aws_dynamodb_table.nba_games.arn}/index/*"
        ]
      },
      # 3. S3 Access
      {
        Action   = ["s3:PutObject", "s3:GetObject"]
        Effect   = "Allow"
        Resource = "arn:aws:s3:::roryeagan.com-nba-processed-data/*"
      },
      # 4. EventBridge Rule Control (To enable/disable the 1-minute poller)
      {
        Action   = ["events:EnableRule", "events:DisableRule"]
        Effect   = "Allow"
        Resource = aws_cloudwatch_event_rule.nba_poller_rule.arn
      },
      # 5. Scheduler Control (To create the "One-Time Wake Up" schedule)
      {
        Action   = ["scheduler:CreateSchedule", "scheduler:DeleteSchedule"]
        Effect   = "Allow"
        Resource = "*" # Scheduler ARNs are dynamic based on name, wildcard is standard here
      },
      # 6. PassRole (Allows Lambda to assign the Scheduler Role to the new Schedule)
      {
        Action   = "iam:PassRole"
        Effect   = "Allow"
        Resource = aws_iam_role.nba_scheduler_role.arn
      }
    ]
  })
}

# D. Policy for the Scheduler (Allow it to invoke the Lambda)
resource "aws_iam_role_policy" "nba_scheduler_policy" {
  name = "nba-scheduler-invoke-policy"
  role = aws_iam_role.nba_scheduler_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = "lambda:InvokeFunction"
      Effect   = "Allow"
      Resource = aws_lambda_function.nba_poller.arn
    }]
  })
}


# --- 2. Lambda Function ---

data "archive_file" "zip_nba_poller" {
  type        = "zip"
  source_dir  = local.src_nba_poller
  output_path = "${local.build_dir}/nba-game-poller.zip"
}

resource "aws_lambda_function" "nba_poller" {
  function_name    = "NBAGamePoller"
  role             = aws_iam_role.nba_poller_role.arn
  handler          = "lambda_function.main_handler"
  runtime          = "python3.11"
  timeout          = 60
  
  filename         = data.archive_file.zip_nba_poller.output_path
  source_code_hash = data.archive_file.zip_nba_poller.output_base64sha256

  environment {
    variables = {
      # 1. Identity & Security
      LAMBDA_ARN = "arn:aws:lambda:us-east-1:${data.aws_caller_identity.current.account_id}:function:NBAGamePoller"
      SCHEDULER_ROLE_ARN = aws_iam_role.nba_scheduler_role.arn

      # 2. Resource Names
      # These prevent the "Hardcoded String" problem
      DATA_BUCKET      = aws_s3_bucket.data_bucket.id
      DDB_TABLE        = aws_dynamodb_table.nba_games.name
      POLLER_RULE_NAME = aws_cloudwatch_event_rule.nba_poller_rule.name
      
      DDB_GSI          = "ByDate" 
    }
  }
}


# --- 3. EventBridge Triggers ---

# A. The Manager (Daily Check)
# Runs at 12:00 PM EST (17:00 UTC). Checks schedule and sets the "Alarm Clock"
resource "aws_cloudwatch_event_rule" "nba_daily_manager" {
  name                = "NBADailyManager"
  description         = "Daily trigger to check game schedule and set polling time"
  # schedule_expression = "cron(0 17 * * ? *)" 
  schedule_expression = "cron(0 20 * * ? *)" 
}

resource "aws_cloudwatch_event_target" "manager_target" {
  rule      = aws_cloudwatch_event_rule.nba_daily_manager.name
  target_id = "ManagerLogic"
  arn       = aws_lambda_function.nba_poller.arn
  
  # Sends {"task": "manager"} to the Lambda
  input = jsonencode({
    task = "manager"
  })
}

# B. The Poller (The Worker)
# Runs every minute, but STARTS DISABLED. The Lambda enables it when games start.
resource "aws_cloudwatch_event_rule" "nba_poller_rule" {
  name                = "NBAGamePollerRule" # Must match POLLER_RULE_NAME in Python
  description         = "Polls active games every minute (Enabled/Disabled dynamically)"
  # schedule_expression = "rate(1 minute)"
  schedule_expression = "rate(5 minutes)"
  state               = "DISABLED" 
}

resource "aws_cloudwatch_event_target" "poller_target" {
  rule      = aws_cloudwatch_event_rule.nba_poller_rule.name
  target_id = "PollerLogic"
  arn       = aws_lambda_function.nba_poller.arn
  
  # Sends {"task": "poller"} to the Lambda
  input = jsonencode({
    task = "poller"
  })
}

# --- 4. Invoke Permissions ---

# Allow the Manager Rule to call Lambda
resource "aws_lambda_permission" "allow_manager_rule" {
  statement_id  = "AllowExecutionFromManagerRule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nba_poller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nba_daily_manager.arn
}

# Allow the Poller Rule to call Lambda
resource "aws_lambda_permission" "allow_poller_rule" {
  statement_id  = "AllowExecutionFromPollerRule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nba_poller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nba_poller_rule.arn
}