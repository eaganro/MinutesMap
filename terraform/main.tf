provider "aws" {
  region = "us-east-1"
}

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "roryeagan.com-nba-terraform-state"
    key            = "state/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    use_lockfile   = true
  }
}

data "aws_caller_identity" "current" {}

data "aws_acm_certificate" "site_cert" {
  domain   = "courtvision.roryeagan.com"
  statuses = ["ISSUED"]
}