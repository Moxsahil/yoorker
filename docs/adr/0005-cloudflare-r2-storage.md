# ADR-0005: Cloudflare R2 for file storage

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Venue photos are viewed far more often than uploaded; invoices are private.

## Decision

Use Cloudflare R2 with two buckets:

- `yoorker-<env>-public` — venue/court photos (WebP), served via public domain
- `yoorker-<env>-private` — invoices, only via short-lived presigned URLs

Uploads go straight from the browser to R2 with presigned PUT URLs.

## Consequences

- No egress fees on photo views.
- S3-compatible API, so the AWS SDK works unchanged.
- Infra spans two providers; both are managed in Terraform.
