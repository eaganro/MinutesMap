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

resource "aws_cloudfront_function" "posthog_rewrite" {
  name    = "minutesmap-posthog-rewrite"
  runtime = "cloudfront-js-1.0"
  comment = "Rewrite /ph/* to /* for PostHog proxy"
  publish = true
  code    = <<EOF
function handler(event) {
  var request = event.request;

  if (request.uri === '/ph') {
    request.uri = '/';
    return request;
  }

  if (request.uri.startsWith('/ph/')) {
    request.uri = request.uri.slice(3);
  }

  return request;
}
EOF
}

resource "aws_cloudfront_cache_policy" "posthog_no_cache" {
  name        = "minutesmap-posthog-no-cache"
  default_ttl = 0
  max_ttl     = 0
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

    enable_accept_encoding_brotli = false
    enable_accept_encoding_gzip   = false
  }
}

resource "aws_cloudfront_response_headers_policy" "frontend_security" {
  name    = "minutesmap-frontend-security"
  comment = "Browser security headers for frontend pages and assets"

  # The deployment role manages this permission through Terraform. Apply the
  # policy update before CloudFront attempts to create the headers policy.
  depends_on = [aws_iam_policy.github_shard_compute]

  security_headers_config {
    content_security_policy {
      content_security_policy = join("; ", [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self' https://analytics.minutesmap.com",
        # React and Emotion render runtime style attributes and style elements.
        "style-src 'self' 'unsafe-inline'",
        # Blob/data images are limited to generated export previews and downloads.
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https://analytics.minutesmap.com ${aws_apigatewayv2_api.websocket_api.api_endpoint}",
        "worker-src 'none'",
        "media-src 'none'",
        "manifest-src 'self'",
        "upgrade-insecure-requests",
      ])
      override = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }

  custom_headers_config {
    items {
      header = "Permissions-Policy"
      value  = join(", ", [
        "accelerometer=()",
        "autoplay=()",
        "camera=()",
        "display-capture=()",
        "encrypted-media=()",
        "fullscreen=(self)",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=()",
        "payment=()",
        "picture-in-picture=()",
        "publickey-credentials-get=()",
        "usb=()",
      ])
      override = true
    }
  }
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

  # Origin 3: PostHog ingestion
  origin {
    domain_name = "us.i.posthog.com"
    origin_id   = "PostHogOrigin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ---------------------------------------------------------
  # BEHAVIORS
  # ---------------------------------------------------------

  # 1. SPECIAL RULE: Proxy PostHog ingestion
  ordered_cache_behavior {
    path_pattern     = "/ph/*"
    target_origin_id = "PostHogOrigin"

    cache_policy_id          = aws_cloudfront_cache_policy.posthog_no_cache.id
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.posthog_rewrite.arn
    }

    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
  }

  # 2. SPECIAL RULE: Serve JSON data from the Data Bucket
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

  # 3. SPECIAL RULE: Serve Schedule from the Data Bucket
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

  # 4. DEFAULT RULE: Serve the App from the Frontend Bucket
  default_cache_behavior {
    target_origin_id = aws_s3_bucket.frontend_bucket.bucket_regional_domain_name

    # Modern Policy IDs
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    origin_request_policy_id   = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend_security.id

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
