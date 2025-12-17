# iam_github.tf

# ==============================================================================
# SHARD 1: IAM & Security
# ==============================================================================
data "aws_iam_policy_document" "github_iam_security" {
  
  # IAM Management (Strict Write with Boundary)
  statement {
    sid    = "IamManageStackRolesWithBoundary"
    effect = "Allow"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", 
      "iam:TagRole", "iam:UntagRole", "iam:PutRolePolicy", 
      "iam:DeleteRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy"
    ]
    resources = [
      "arn:aws:iam::*:role/ws-joinDate-handler-role",
      "arn:aws:iam::*:role/ws-sendGameUpdate-handler-role",
      "arn:aws:iam::*:role/ws-disconnect-handler-role",
      "arn:aws:iam::*:role/gameDateUpdates-role",
      "arn:aws:iam::*:role/ws-joinGame-handler-role",
      "arn:aws:iam::*:role/FetchTodaysScoreboard-role",
      "arn:aws:iam::*:role/nba-poller-lambda-role",
      "arn:aws:iam::*:role/nba-poller-scheduler-role"
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/CourtVisionBoundary"]
    }
  }

  # IAM Read-Only & PassRole
  statement {
    sid    = "IamReadAndPass"
    effect = "Allow"
    actions = [
      "iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", 
      "iam:ListAttachedRolePolicies", "iam:PassRole", "iam:GetPolicy", 
      "iam:GetPolicyVersion", "sts:GetCallerIdentity"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_iam_security" {
  name   = "GitHubActions-IAM-Security"
  path   = "/"
  policy = data.aws_iam_policy_document.github_iam_security.json
}

resource "aws_iam_role_policy_attachment" "attach_security" {
  role       = "GitHubActionRole"
  policy_arn = aws_iam_policy.github_iam_security.arn
}

# ==============================================================================
# SHARD 2: Data & Storage (S3 & DynamoDB)
# ==============================================================================
data "aws_iam_policy_document" "github_data_storage" {
  
  # S3 Management
  statement {
    sid    = "S3ManageStackBuckets"
    effect = "Allow"
    actions = [
      "s3:CreateBucket", "s3:DeleteBucket", "s3:GetBucketLocation", "s3:ListBucket",
      "s3:GetBucketNotification", "s3:PutBucketNotification", "s3:GetBucketPolicy",
      "s3:PutBucketPolicy", "s3:GetBucketAcl", "s3:GetBucketCORS", "s3:GetBucketWebsite",
      "s3:GetBucketVersioning", "s3:GetBucketTagging", "s3:GetBucketLogging",
      "s3:GetLifecycleConfiguration", "s3:GetEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock", "s3:GetAccelerateConfiguration",
      "s3:GetBucketRequestPayment", "s3:GetBucketObjectLockConfiguration",
      "s3:GetReplicationConfiguration", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"
    ]
    resources = [
      "arn:aws:s3:::roryeagan.com-nba-processed-data",
      "arn:aws:s3:::roryeagan.com-nba",
      "arn:aws:s3:::roryeagan.com-nba-terraform-state",
      "arn:aws:s3:::roryeagan.com-nba-terraform-state/state/*"
    ]
  }

  # DynamoDB
  statement {
    sid    = "DynamoDbManage"
    effect = "Allow"
    actions = [
      "dynamodb:CreateTable", "dynamodb:DeleteTable", "dynamodb:DescribeTable",
      "dynamodb:UpdateTable", "dynamodb:DescribeStream", "dynamodb:UpdateTimeToLive",
      "dynamodb:DescribeTimeToLive", "dynamodb:DescribeContinuousBackups",
      "dynamodb:UpdateContinuousBackups", "dynamodb:TagResource", 
      "dynamodb:UntagResource", "dynamodb:ListTagsOfResource"
    ]
    resources = [
      "arn:aws:dynamodb:us-east-1:*:table/NBA_Games*",
      "arn:aws:dynamodb:us-east-1:*:table/GameConnections*",
      "arn:aws:dynamodb:us-east-1:*:table/DateConnections*"
    ]
  }
}

resource "aws_iam_policy" "github_data_storage" {
  name   = "GitHubActions-Data-Storage"
  path   = "/"
  policy = data.aws_iam_policy_document.github_data_storage.json
}

resource "aws_iam_role_policy_attachment" "attach_storage" {
  role       = "GitHubActionRole"
  policy_arn = aws_iam_policy.github_data_storage.arn
}

# ==============================================================================
# SHARD 3: Compute & Networking (Lambda, Gateway, Events)
# ==============================================================================
data "aws_iam_policy_document" "github_compute_network" {
  
  # Lambda
  statement {
    sid    = "LambdaManage"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction", "lambda:DeleteFunction", "lambda:Get*", 
      "lambda:Update*", "lambda:PublishVersion", "lambda:List*", 
      "lambda:AddPermission", "lambda:RemovePermission", "lambda:TagResource", 
      "lambda:UntagResource", "lambda:CreateEventSourceMapping", 
      "lambda:DeleteEventSourceMapping"
    ]
    resources = ["*"]
  }

  # EventBridge & Scheduler
  statement {
    sid    = "EventsManage"
    effect = "Allow"
    actions = [
      "events:*", 
      "scheduler:*"
    ]
    resources = [
      "arn:aws:events:us-east-1:*:rule/NBA*",
      "arn:aws:scheduler:us-east-1:*:schedule/default/NBA_Daily_Kickoff"
    ]
  }

  # API Gateway & CloudFront & ACM
  statement {
    sid    = "NetworkManage"
    effect = "Allow"
    actions = [
      "apigateway:*",
      "cloudfront:*",
      "acm:List*", "acm:Describe*", "acm:Get*"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_compute_network" {
  name   = "GitHubActions-Compute-Network"
  path   = "/"
  policy = data.aws_iam_policy_document.github_compute_network.json
}

resource "aws_iam_role_policy_attachment" "attach_compute" {
  role       = "GitHubActionRole"
  policy_arn = aws_iam_policy.github_compute_network.arn
}