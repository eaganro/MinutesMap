# ---------------------------------------------------------
# API GATEWAY (WebSocket)
# ---------------------------------------------------------
resource "aws_apigatewayv2_api" "websocket_api" {
  name                       = "basketballStats"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

# Keep WebSocket routes live without manual deployments.
resource "aws_apigatewayv2_stage" "websocket_production" {
  api_id      = aws_apigatewayv2_api.websocket_api.id
  name        = "production"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 200
    throttling_rate_limit  = 100
  }
}

# --- Integration: followDate ---
resource "aws_apigatewayv2_integration" "ws_join_date" {
  api_id             = aws_apigatewayv2_api.websocket_api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.ws_join_date.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "ws_join_date" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "followDate"
  target    = "integrations/${aws_apigatewayv2_integration.ws_join_date.id}"
}

resource "aws_lambda_permission" "allow_apigw_ws_join_date" {
  statement_id  = "AllowWsJoinDate"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_join_date.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket_api.execution_arn}/*/*"
}

# --- Integration: followGame ---
resource "aws_apigatewayv2_integration" "ws_join_game" {
  api_id             = aws_apigatewayv2_api.websocket_api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.ws_join_game.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "ws_join_game" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "followGame"
  target    = "integrations/${aws_apigatewayv2_integration.ws_join_game.id}"
}

resource "aws_lambda_permission" "allow_apigw_ws_join_game" {
  statement_id  = "AllowWsJoinGame"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_join_game.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket_api.execution_arn}/*/*"
}

# --- Integration: unfollowDate ---
resource "aws_apigatewayv2_integration" "ws_unfollow_date" {
  api_id             = aws_apigatewayv2_api.websocket_api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.ws_unfollow_date.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "ws_unfollow_date" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "unfollowDate"
  target    = "integrations/${aws_apigatewayv2_integration.ws_unfollow_date.id}"
}

resource "aws_lambda_permission" "allow_apigw_ws_unfollow_date" {
  statement_id  = "AllowWsUnfollowDate"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_unfollow_date.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket_api.execution_arn}/*/*"
}

# --- Integration: unfollowGame ---
resource "aws_apigatewayv2_integration" "ws_unfollow_game" {
  api_id             = aws_apigatewayv2_api.websocket_api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.ws_unfollow_game.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "ws_unfollow_game" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "unfollowGame"
  target    = "integrations/${aws_apigatewayv2_integration.ws_unfollow_game.id}"
}

resource "aws_lambda_permission" "allow_apigw_ws_unfollow_game" {
  statement_id  = "AllowWsUnfollowGame"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_unfollow_game.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket_api.execution_arn}/*/*"
}
