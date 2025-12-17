# ---------------------------------------------------------
# DYNAMODB TABLES
# ---------------------------------------------------------

# 1. NBA_Games Table (Schedule & Metadata)
resource "aws_dynamodb_table" "nba_games" {
  name           = "NBA_Games"
  billing_mode   = "PROVISIONED" 
  read_capacity  = 1
  write_capacity = 1
  hash_key       = "PK"
  range_key      = "SK"

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
    write_capacity  = 1
    read_capacity   = 1
    projection_type = "ALL"
  }
}

# 2. GameConnections Table (WebSocket Sessions)
resource "aws_dynamodb_table" "game_connections" {
  name         = "GameConnections"
  # billing_mode = "PAY_PER_REQUEST"
  billing_mode   = "PROVISIONED" 
  read_capacity  = 1
  write_capacity = 1
  hash_key     = "connectionId"

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
    write_capacity  = 1
    read_capacity   = 1
    projection_type = "ALL"
  }
}

# TABLE 3: DateConnections (WebSocket Sessions for Schedule/Dates)
resource "aws_dynamodb_table" "date_connections" {
  name         = "DateConnections"
  # billing_mode = "PAY_PER_REQUEST"
  billing_mode   = "PROVISIONED" 
  read_capacity  = 1
  write_capacity = 1
  hash_key     = "connectionId"

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
    write_capacity  = 1
    read_capacity   = 1
    projection_type = "ALL"
  }
}