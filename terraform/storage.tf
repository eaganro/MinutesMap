# storage.tf

# ---------------------------------------------------------
# S3 BUCKETS
# ---------------------------------------------------------

# 1. The Data Bucket
resource "aws_s3_bucket" "data_bucket" {
  bucket = "roryeagan.com-nba-processed-data"
}

resource "aws_s3_bucket_notification" "data_bucket_trigger" {
  bucket = aws_s3_bucket.data_bucket.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.ws_send_update.arn
    events              = ["s3:ObjectCreated:*"]
    
    # Filter to only trigger on relevant files to save costs/invocations
    filter_prefix       = "data/"
    filter_suffix       = ".json.gz"
  }

  lambda_function {
    lambda_function_arn = aws_lambda_function.game_date_updates.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "schedule/"
    filter_suffix       = ".json.gz"
  }

  depends_on = [
    aws_lambda_permission.allow_s3_trigger,
    aws_lambda_permission.allow_s3_game_date_updates,
  ]
}

# 2. The Frontend Hosting Bucket
resource "aws_s3_bucket" "frontend_bucket" {
  bucket = "roryeagan.com-nba"
}
