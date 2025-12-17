# iam_github.tf

# ==============================================================================
# SHARD 1: IAM & Security
# ==============================================================================
data "aws_iam_policy_document" "github_shard_iam" {
  
  # --- Section 1: General Discovery & Read-Only ---
  # FIX: Added iam:GetPolicy/Version here so Terraform can read the Shard policies it creates
  statement {
    sid    = "GeneralReadDiscovery"
    effect = "Allow"
    actions = [
      "sts:GetCallerIdentity",
      "acm:ListCertificates",
      "acm:DescribeCertificate",
      "acm:GetCertificate",
      "acm:ListTagsForCertificate",
      "lambda:ListFunctions",
      "lambda:GetAccountSettings",
      "iam:GetPolicy",
      "iam:GetPolicyVersion" 
    ]
    resources = ["*"]
  }

  # --- Section 2: IAM Management (Strict Write) ---
  statement {
    sid    = "IamManageStackRolesWithBoundary"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy"
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
    
    # Enforces boundary on NEW roles
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/CourtVisionBoundary"]
    }
  }

  statement {
    sid    = "IamReadStackRoles"
    effect = "Allow"
    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies"
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
  }

  statement {
    sid     = "IamPassRolesToApprovedServicesOnly"
    effect  = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ws-joinDate-handler-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ws-sendGameUpdate-handler-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ws-disconnect-handler-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/gameDateUpdates-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ws-joinGame-handler-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/FetchTodaysScoreboard-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/nba-poller-lambda-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/nba-poller-scheduler-role"
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com","events.amazonaws.com","scheduler.amazonaws.com","apigateway.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "github_shard_iam" {
  name   = "GitHubActions-Shard-IAM"
  path   = "/"
  policy = data.aws_iam_policy_document.github_shard_iam.json
}

resource "aws_iam_role_policy_attachment" "attach_shard_iam" {
  role       = "GitHubActionRole"
  policy_arn = aws_iam_policy.github_shard_iam.arn
}

# ==============================================================================
# SHARD 2: Data & Storage
# ==============================================================================
data "aws_iam_policy_document" "github_shard_data" {

  # --- Section 4: DynamoDB Management ---
  statement {
    sid    = "DynamoDbManageStackTables"
    effect = "Allow"
    actions = [
      "dynamodb:CreateTable",
      "dynamodb:DeleteTable",
      "dynamodb:DescribeTable",
      "dynamodb:UpdateTable",
      "dynamodb:DescribeStream",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:UpdateContinuousBackups",
      "dynamodb:TagResource",
      "dynamodb:UntagResource",
      "dynamodb:ListTagsOfResource"
    ]
    resources = [
      "arn:aws:dynamodb:us-east-1:*:table/NBA_Games*",
      "arn:aws:dynamodb:us-east-1:*:table/GameConnections*",
      "arn:aws:dynamodb:us-east-1:*:table/DateConnections*"
    ]
  }

  # --- Section 5: S3 Management ---
  statement {
    sid    = "S3ManageStackBuckets"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:GetBucketNotification",
      "s3:PutBucketNotification",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:GetBucketAcl",
      "s3:GetBucketCORS",
      "s3:GetBucketWebsite",
      "s3:GetBucketVersioning",
      "s3:GetBucketTagging",
      "s3:GetBucketLogging",
      "s3:GetLifecycleConfiguration",
      "s3:GetEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetAccelerateConfiguration",
      "s3:GetBucketRequestPayment",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetReplicationConfiguration"
    ]
    resources = [
      "arn:aws:s3:::roryeagan.com-nba-processed-data",
      "arn:aws:s3:::roryeagan.com-nba"
    ]
  }

  # --- Section 8: Terraform State Access ---
  statement {
    sid    = "TerraformStateAccess"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]
    resources = [
      "arn:aws:s3:::roryeagan.com-nba-terraform-state",
      "arn:aws:s3:::roryeagan.com-nba-terraform-state/state/*"
    ]
  }
}

resource "aws_iam_policy" "github_shard_data" {
  name   = "GitHubActions-Shard-Data"
  path   = "/"
  policy = data.aws_iam_policy_document.github_shard_data.json
}

resource "aws_iam_role_policy_attachment" "attach_shard_data" {
  role       = "GitHubActionRole"
  policy_arn = aws_iam_policy.github_shard_data.arn
}

# ==============================================================================
# SHARD 3: Compute & Networking
# ==============================================================================
data "aws_iam_policy_document" "github_shard_compute" {

  # --- Section 3: Lambda Management ---
  statement {
    sid    = "LambdaManageStackFunctions"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:GetFunctionCodeSigningConfig",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:PublishVersion",
      "lambda:ListVersionsByFunction",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:GetPolicy"
    ]
    resources = ["arn:aws:lambda:us-east-1:${data.aws_caller_identity.current.account_id}:function:*"]
  }

  # FIX: Moved Tagging actions here because Mappings are NOT functions.
  statement {
    sid    = "LambdaManageMappingsAndTags"
    effect = "Allow"
    actions = [
      "lambda:CreateEventSourceMapping",
      "lambda:UpdateEventSourceMapping",
      "lambda:DeleteEventSourceMapping",
      "lambda:GetEventSourceMapping",
      "lambda:ListEventSourceMappings",
      "lambda:ListTags",
      "lambda:TagResource",
      "lambda:UntagResource"
    ]
    resources = ["*"]
  }

  # --- Section 6: EventBridge & Scheduler ---
  statement {
    sid    = "EventBridgeManageRules"
    effect = "Allow"
    actions = [
      "events:PutRule",
      "events:DeleteRule",
      "events:DescribeRule",
      "events:EnableRule",
      "events:DisableRule",
      "events:PutTargets",
      "events:RemoveTargets",
      "events:ListTargetsByRule",
      "events:ListTagsForResource",
      "events:TagResource",
      "events:UntagResource"
    ]
    resources = ["arn:aws:events:us-east-1:*:rule/NBA*"]
  }

  statement {
    sid    = "SchedulerManage"
    effect = "Allow"
    actions = [
      "scheduler:GetSchedule",
      "scheduler:CreateSchedule",
      "scheduler:UpdateSchedule",
      "scheduler:DeleteSchedule"
    ]
    resources = ["arn:aws:scheduler:us-east-1:*:schedule/default/NBA_Daily_Kickoff"]
  }

  # --- Section 7: API Gateway & CloudFront ---
  statement {
    sid    = "ApiGatewayManage"
    effect = "Allow"
    actions = ["apigateway:*"]
    resources = [
      "arn:aws:apigateway:us-east-1::/apis",
      "arn:aws:apigateway:us-east-1::/apis/*",
      "arn:aws:apigateway:us-east-1::/tags/*"
    ]
  }

  statement {
    sid    = "CloudFrontManage"
    effect = "Allow"
    actions = [
      "cloudfront:GetDistribution",
      "cloudfront:GetDistributionConfig",
      "cloudfront:UpdateDistribution",
      "cloudfront:DeleteDistribution",
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
      "cloudfront:TagResource",
      "cloudfront:UntagResource",
      "cloudfront:ListTagsForResource"
    ]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/E27FQC8AKVWFV6"]
  }
  
  statement {
    sid    = "CloudFrontCreate"
    effect = "Allow"
    actions = [
      "cloudfront:CreateDistribution",
      "cloudfront:CreateOriginAccessControl",
      "cloudfront:GetOriginAccessControl",
      "cloudfront:DeleteOriginAccessControl"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_shard_compute" {
  name   = "GitHubActions-Shard-Compute"
  path   = "/"
  policy = data.aws_iam_policy_document.github_shard_compute.json
}

resource "aws_iam_role_policy_attachment" "attach_shard_compute" {
  role       = "GitHubActionRole"
  policy_arn = aws_iam_policy.github_shard_compute.arn
}