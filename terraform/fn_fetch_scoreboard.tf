# FetchTodaysScoreboard was retired (the NBA poller writes schedules and game ID maps). Terraform
# deletes the Lambda; the CI role can't delete IAM roles, so these are only dropped from state and
# the role is deleted by hand. Remove this file once that has been applied.

removed {
  from = aws_iam_role.fetch_scoreboard_role
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_iam_role_policy_attachment.fetch_scoreboard_logs
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_iam_role_policy.fetch_scoreboard_s3_write
  lifecycle {
    destroy = false
  }
}
