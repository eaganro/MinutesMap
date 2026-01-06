# frontend.tf

resource "aws_cloudfront_cache_policy" "frontend_long_cache" {
  name        = "frontend-long-cache"
  comment     = "Long-term caching for static frontend assets."
  default_ttl = 31536000
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  aliases             = ["courtvision.roryeagan.com"]
  price_class         = "PriceClass_All"
  default_root_object = "index.html"

  # ---------------------------------------------------------
  # ORIGINS
  # ---------------------------------------------------------

  # Origin 1: Frontend Bucket (The Website)
  origin {
    domain_name              = aws_s3_bucket.frontend_bucket.bucket_regional_domain_name
    origin_id                = aws_s3_bucket.frontend_bucket.bucket_regional_domain_name
    origin_access_control_id = "E1XIFOPBUJ5S25"
  }

  # Origin 2: Data Bucket (The JSON stats)
  origin {
    domain_name              = aws_s3_bucket.data_bucket.bucket_regional_domain_name
    origin_id                = aws_s3_bucket.data_bucket.bucket_regional_domain_name
    origin_access_control_id = "E3V205NEY044Q6"
  }

  # ---------------------------------------------------------
  # BEHAVIORS
  # ---------------------------------------------------------

  # 1. SPECIAL RULE: Serve JSON data from the Data Bucket
  ordered_cache_behavior {
    path_pattern     = "/data/*"
    target_origin_id = aws_s3_bucket.data_bucket.bucket_regional_domain_name

    # Modern Policy IDs
    cache_policy_id            = "cff81036-bd3d-46a6-8956-eafed459cbae"
    origin_request_policy_id   = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"
    response_headers_policy_id = "60669652-455b-4ae9-85a4-c4c02393f86c"

    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
  }

  # 2. SPECIAL RULE: Serve Schedule from the Data Bucket
  ordered_cache_behavior {
    path_pattern     = "/schedule/*"
    target_origin_id = aws_s3_bucket.data_bucket.bucket_regional_domain_name

    # Use exact same policies as /data/ for consistency
    cache_policy_id            = "cff81036-bd3d-46a6-8956-eafed459cbae" 
    origin_request_policy_id   = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"
    response_headers_policy_id = "60669652-455b-4ae9-85a4-c4c02393f86c"

    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
  }

  # 3. DEFAULT RULE: Serve the App from the Frontend Bucket
  default_cache_behavior {
    target_origin_id = aws_s3_bucket.frontend_bucket.bucket_regional_domain_name

    # Modern Policy IDs
    cache_policy_id          = aws_cloudfront_cache_policy.frontend_long_cache.id
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"

    compress               = true
    viewer_protocol_policy = "allow-all" # Matches your current settings
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
  }

  # ---------------------------------------------------------
  # SSL & RESTRICTIONS
  # ---------------------------------------------------------

  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.site_cert.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
