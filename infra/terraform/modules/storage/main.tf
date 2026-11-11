terraform {
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
}

variable "name" { type = string }
variable "account_id" { type = string }

resource "cloudflare_r2_bucket" "public" {
  account_id = var.account_id
  name       = "${var.name}-public"
  location   = "APAC"
}

resource "cloudflare_r2_bucket" "private" {
  account_id = var.account_id
  name       = "${var.name}-private"
  location   = "APAC"
}

output "public_bucket" { value = cloudflare_r2_bucket.public.name }
output "private_bucket" { value = cloudflare_r2_bucket.private.name }
