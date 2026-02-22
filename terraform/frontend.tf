# frontend.tf

resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "minutesmap-spa-rewrite"
  runtime = "cloudfront-js-1.0"
  comment = "Rewrite SPA routes to /index.html"
  publish = true
  code    = <<EOF
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host && request.headers.host.value ? request.headers.host.value : '';

  function buildQueryString(query) {
    if (!query) {
      return '';
    }

    var parts = [];
    for (var key in query) {
      if (!Object.prototype.hasOwnProperty.call(query, key)) {
        continue;
      }
      var entry = query[key];
      if (!entry) {
        continue;
      }
      if (entry.multiValue && entry.multiValue.length > 0) {
        for (var i = 0; i < entry.multiValue.length; i++) {
          var mv = entry.multiValue[i];
          if (mv && mv.value !== undefined) {
            parts.push(key + '=' + mv.value);
          }
        }
        continue;
      }
      if (entry.value !== undefined) {
        parts.push(key + '=' + entry.value);
      } else {
        parts.push(key);
      }
    }

    return parts.length ? '?' + parts.join('&') : '';
  }

  if (host === 'www.minutesmap.com') {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: {
          value: 'https://minutesmap.com' + uri + buildQueryString(request.querystring)
        }
      }
    };
  }

  if (uri.startsWith('/data/') || uri.startsWith('/schedule/')) {
    return request;
  }

  if (uri === '/privacy' || uri === '/privacy/') {
    request.uri = '/privacy/index.html';
    return request;
  }

  if (uri === '/about' || uri === '/about/') {
    request.uri = '/about/index.html';
    return request;
  }

  if (uri.startsWith('/static-pages/')) {
    return request;
  }

  if (uri.indexOf('.') !== -1) {
    return request;
  }

  request.uri = '/index.html';
  return request;
}
EOF
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  aliases             = ["minutesmap.com", "www.minutesmap.com"]
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
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }

    compress               = true
    viewer_protocol_policy = "redirect-to-https"
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
