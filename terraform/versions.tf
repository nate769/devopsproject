terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.95, < 6.0"
    }
  }

  # State is kept locally for this project. For a team, use a remote backend, e.g.:
  # backend "s3" {
  #   bucket       = "my-tf-state-bucket"
  #   key          = "stockpile/terraform.tfstate"
  #   region       = "ap-south-1"
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}
