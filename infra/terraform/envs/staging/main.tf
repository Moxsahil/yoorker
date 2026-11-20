terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
  }

  backend "s3" {
    bucket       = "yoorker-tfstate"
    key          = "staging/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = {
      Project     = "yoorker"
      Environment = local.env
      ManagedBy   = "terraform"
    }
  }
}

provider "cloudflare" {}

variable "cloudflare_account_id" {
  type = string
}

locals {
  env  = "staging"
  name = "yoorker-${local.env}"
}

module "network" {
  source = "../../modules/network"
  name   = local.name
}

module "api" {
  source = "../../modules/api"
  name   = local.name
  vpc_id = module.network.vpc_id
}

module "database" {
  source                     = "../../modules/database"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.api.security_group_id]
  instance_class             = "db.t4g.micro"
  multi_az                   = false
  deletion_protection        = false
}

module "storage" {
  source     = "../../modules/storage"
  name       = local.name
  account_id = var.cloudflare_account_id
}

output "ecr_repository_url" { value = module.api.ecr_repository_url }
output "db_endpoint" { value = module.database.endpoint }
output "db_secret_arn" { value = module.database.master_secret_arn }
