variable "name" { type = string }

variable "cidr" {
  type    = string
  default = "10.0.0.0/16"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name            = var.name
  cidr            = var.cidr
  azs             = ["ap-south-1a", "ap-south-1b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24"]

  # No NAT gateway: ECS tasks run in public subnets with a public IP; RDS stays private.
  enable_nat_gateway   = false
  enable_dns_hostnames = true
}

output "vpc_id" { value = module.vpc.vpc_id }
output "public_subnet_ids" { value = module.vpc.public_subnets }
output "private_subnet_ids" { value = module.vpc.private_subnets }
