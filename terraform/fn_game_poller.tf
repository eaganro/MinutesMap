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

  permissions_boundary = var.iam_boundary_arn
}

# B. Role for the EventBridge Scheduler
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

  permissions_boundary = var.iam_boundary_arn
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
        Sid      = "WriteLambdaLogs",
        Effect   = "Allow",
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource = "arn:aws:logs:us-east-1:*:log-group:/aws/lambda/NBAGamePoller:*"
      },
      # 2. S3 Access
      {
        Sid      = "S3ReadWriteOnlyDataPrefix"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Effect   = "Allow"
        Resource = "arn:aws:s3:::roryeagan.com-nba-processed-data/data/*"
      },
      # 3. EventBridge Rule Control
      {
        Sid      = "EventBridgeTogglePollerRule"
        Action   = ["events:EnableRule", "events:DisableRule"]
        Effect   = "Allow"
        Resource = aws_cloudwatch_event_rule.nba_poller_rule.arn
      },
      # 4. Scheduler Control
      {
        Sid      = "SchedulerManageOnlyKickoffSchedule"
        Action   = ["scheduler:CreateSchedule", "scheduler:DeleteSchedule"]
        Effect   = "Allow"
        Resource = "arn:aws:events:us-east-1:*:schedule/default/NBA_Daily_Kickoff"
      },
      # 5. PassRole
      {
        Sid      = "AllowPassSchedulerRoleToScheduler"
        Action   = "iam:PassRole"
        Effect   = "Allow"
        Resource = aws_iam_role.nba_scheduler_role.arn
      }
    ]
  })
}

# D. Policy for the Scheduler
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
      LAMBDA_ARN = "arn:aws:lambda:us-east-1:${data.aws_caller_identity.current.account_id}:function:NBAGamePoller"
      SCHEDULER_ROLE_ARN = aws_iam_role.nba_scheduler_role.arn
      DATA_BUCKET      = aws_s3_bucket.data_bucket.id
      POLLER_RULE_NAME = aws_cloudwatch_event_rule.nba_poller_rule.name
    }
  }
}


# --- 3. EventBridge Triggers ---

resource "aws_cloudwatch_event_rule" "nba_daily_manager" {
  name                = "NBADailyManager"
  description         = "Daily trigger to check game schedule and set polling time"
  schedule_expression = "cron(0 11 * * ? *)"
}

resource "aws_cloudwatch_event_target" "manager_target" {
  rule      = aws_cloudwatch_event_rule.nba_daily_manager.name
  target_id = "ManagerLogic"
  arn       = aws_lambda_function.nba_poller.arn
  input = jsonencode({
    task = "manager"
  })
}

resource "aws_cloudwatch_event_rule" "nba_poller_rule" {
  name                = "NBAGamePollerRule"
  description         = "Polls active games every minute (Enabled/Disabled dynamically)"
  schedule_expression = "rate(1 minute)"
  state               = "DISABLED"

  lifecycle {
    ignore_changes = [
      state,
    ]
  }
}

resource "aws_cloudwatch_event_target" "poller_target" {
  rule      = aws_cloudwatch_event_rule.nba_poller_rule.name
  target_id = "PollerLogic"
  arn       = aws_lambda_function.nba_poller.arn
  input = jsonencode({
    task = "poller"
  })
}

# --- 4. Invoke Permissions ---

resource "aws_lambda_permission" "allow_manager_rule" {
  statement_id  = "AllowExecutionFromManagerRule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nba_poller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nba_daily_manager.arn
}

resource "aws_lambda_permission" "allow_poller_rule" {
  statement_id  = "AllowExecutionFromPollerRule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nba_poller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nba_poller_rule.arn
}
