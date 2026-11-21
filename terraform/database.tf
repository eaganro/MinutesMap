# ---------------------------------------------------------
# DYNAMODB TABLES
# ---------------------------------------------------------

# 1. NBA_Games Table (Schedule & Metadata)
resource "aws_dynamodb_table" "nba_games" {
  name         = "NBA_Games"
  billing_mode = "PAY_PER_REQUEST"

  # Ceiling on requests per second, so a spike or a bug cannot run up the bill.
  on_demand_throughput {
    max_read_request_units  = 50
    max_write_request_units = 25
  }

  hash_key  = "PK"
  range_key = "SK"

  stream_enabled   = true
  stream_view_type = "NEW_IMAGE"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  attribute {
    name = "id"
    type = "S"
  }

  # Global Secondary Index: ByDate
  global_secondary_index {
    name            = "ByDate"
    hash_key        = "date"
    range_key       = "id"
    projection_type = "ALL"
  }
}

# 2. GameConnections Table (WebSocket Sessions)
resource "aws_dynamodb_table" "game_connections" {
  name         = "GameConnections"
  billing_mode = "PAY_PER_REQUEST"

  # Ceiling on requests per second, so a spike or a bug cannot run up the bill.
  on_demand_throughput {
    max_read_request_units  = 50
    max_write_request_units = 25
  }

  hash_key = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  attribute {
    name = "gameId"
    type = "S"
  }

  # Global Secondary Index: gameId-index
  global_secondary_index {
    name            = "gameId-index"
    hash_key        = "gameId"
    projection_type = "ALL"
  }
}

# TABLE 3: DateConnections (WebSocket Sessions for Schedule/Dates)
resource "aws_dynamodb_table" "date_connections" {
  name         = "DateConnections"
  billing_mode = "PAY_PER_REQUEST"

  # Ceiling on requests per second, so a spike or a bug cannot run up the bill.
  on_demand_throughput {
    max_read_request_units  = 50
    max_write_request_units = 25
  }

  hash_key = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  attribute {
    name = "dateString"
    type = "S"
  }

  global_secondary_index {
    name            = "date-index"
    hash_key        = "dateString"
    projection_type = "ALL"
  }
}