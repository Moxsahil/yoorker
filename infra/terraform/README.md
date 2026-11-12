# Infrastructure (Terraform)

> **Not applied yet.** Until the pilot, Yoorker runs on free tiers (Supabase, Render, Vercel,
> Cloudflare). See [ADR-0006](../../docs/adr/0006-zero-cost-hosting-until-pilot.md). This
> Terraform is kept for a later move to AWS Mumbai.

AWS ap-south-1 (Mumbai): VPC, RDS PostgreSQL 16, ECR, ECS Fargate.
Cloudflare: R2 buckets.

```
envs/staging      → staging stack
envs/production   → production stack (copy of staging, bigger sizes, Multi-AZ)
modules/network   → VPC, subnets
modules/database  → RDS Postgres
modules/api       → ECR, ECS cluster, logs, security group
modules/storage   → R2 public + private buckets
```

## One-time bootstrap (state bucket)

```bash
aws s3api create-bucket --bucket yoorker-tfstate --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
aws s3api put-bucket-versioning --bucket yoorker-tfstate \
  --versioning-configuration Status=Enabled
```

## Usage

```bash
cd infra/terraform/envs/staging
export CLOUDFLARE_API_TOKEN=...
terraform init
terraform plan -var="cloudflare_account_id=..."
terraform apply -var="cloudflare_account_id=..."
```

After RDS is up, run `CREATE EXTENSION postgis; CREATE EXTENSION btree_gist;` via migrations.
