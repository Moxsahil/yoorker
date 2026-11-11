variable "name" { type = string }
variable "vpc_id" { type = string }

resource "aws_ecr_repository" "api" {
  name                 = "${var.name}-api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecs_cluster" "this" {
  name = var.name
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.name}-api"
  retention_in_days = 30
}

resource "aws_security_group" "api" {
  name   = "${var.name}-api"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # tighten to the ALB security group once the ALB exists
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# TODO (TURF-006): task definition, ECS service, ALB + ACM cert, GitHub OIDC deploy role.

output "ecr_repository_url" { value = aws_ecr_repository.api.repository_url }
output "cluster_name" { value = aws_ecs_cluster.this.name }
output "security_group_id" { value = aws_security_group.api.id }
output "log_group_name" { value = aws_cloudwatch_log_group.api.name }
