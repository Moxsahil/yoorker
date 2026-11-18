# ADR-0006: Zero-cost hosting until the pilot, AWS deferred

- **Status:** Accepted
- **Date:** 2026-11-11
- **Amends:** ADR-0002 (where Postgres runs), RFC-001 § Environments, TURF-006
- **Updated:** 2026-11-17: bought `yoorker.com`; staging runs on its subdomains
- **Updated:** 2026-11-18: pilot moved to 8 Feb 2027 (Sprint Plan v1.2); the hosting review
  moves to Sprint 5

## Context

The sprint plan puts staging and production on AWS Mumbai (RDS + ECS Fargate + ALB), built
with Terraform in Sprint 0 (TURF-006). That costs roughly $45–50/month for staging alone and
about $90–100/month with production. No real user touches the system until the pilot
(25 Jan 2027 when this was written; 8 Feb 2027 since Sprint Plan v1.2), and the project has no
budget for development.

The hosting still has to meet these requirements:

1. PostgreSQL with `postgis` and `btree_gist`, because the no-double-booking exclusion
   constraint (ADR-0004) needs `btree_gist`.
2. A session-level database connection, because pg-boss and `LISTEN/NOTIFY` (SSE live
   updates) do not work through a transaction-mode pooler.
3. A long-running API process for SSE, pg-boss workers and Razorpay webhooks. Serverless
   functions do not qualify.
4. Hosting close to India.

## Decision

Until the pilot, run everything on free tiers:

| Part                  | Host                                                  | URL / region                         |
| --------------------- | ----------------------------------------------------- | ------------------------------------ |
| Postgres + PostGIS    | Supabase Free                                         | Singapore (`ap-southeast-1`)         |
| API (NestJS)          | Render Free web service                               | Singapore, `staging-api.yoorker.com` |
| Player web (Next.js)  | Vercel Hobby                                          | `staging.yoorker.com`                |
| Owner dashboard       | Cloudflare Pages                                      | `staging-app.yoorker.com`            |
| Files                 | Cloudflare R2 (free tier)                             | unchanged (ADR-0005)                 |
| Payments              | Razorpay test mode                                    | —                                    |
| WhatsApp OTP/messages | Meta WhatsApp Cloud API test number                   | no BSP during development            |
| SMS fallback          | Not used in development; dev OTP is logged by the API | DLT deferred                         |
| Domain + DNS          | `yoorker.com`, Cloudflare Registrar and DNS           | —                                    |

All three apps sit under `yoorker.com`, so the dashboard and the API are the same site and the
`SameSite=Lax` session cookie works between them. The free `*.pages.dev` and `*.onrender.com`
names are different sites, where the cookie would not be sent. Records for Render and Vercel
are DNS-only so those hosts can issue their own certificates. See
`docs/runbooks/staging.md` for the full setup.

The API and the database stay in the same region (Singapore) to keep query latency low.
The API connects through Supabase's **Session pooler** (port 5432), never the Transaction
pooler (port 6543).

GitHub Actions remains the deploy controller. `deploy.yml` calls a Render deploy hook stored
as an environment secret, so the `production` environment's required-reviewer gate still
applies once production exists.

The AWS Terraform in `infra/terraform` is kept but not applied. The Terraform Dependabot PRs
(#4, #5, #7) stay open until AWS is picked up again.

## Consequences

- Development costs ₹0.
- **Render Free sleeps after about 15 minutes idle.** The first request after that takes up to
  a minute, and pg-boss jobs do not run while it sleeps. This is acceptable for development
  and not acceptable once real bookings exist.
- **Supabase Free pauses after 7 days of inactivity** and has no backups. Restore it from the
  dashboard when needed, and never store real bookings or ledger entries on it.
- **Vercel Hobby is for non-commercial use only.** Before taking payments, `apps/web` moves to
  Vercel Pro or to Cloudflare.
- Singapore adds about 60–80 ms per request from Gurugram compared with Mumbai. This is
  acceptable for booking and payments.
- The app stays portable: the API is one Node process and the database is plain Postgres, so
  moving to AWS (or Fly.io) later changes `DATABASE_URL` and the deploy target, not the code.

## Before the pilot (Sprint 5, 25 Jan–5 Feb 2027)

These become required once real money flows:

- [ ] Supabase → **Pro** (no pausing, daily backups)
- [ ] API → an always-on paid instance (Render Starter or Fly.io)
- [ ] `apps/web` → a host that allows commercial use
- [x] Register `yoorker.com` (done 2026-11-17); put the booking link on it
- [ ] Verify the database certificate (`sslmode=verify-full`); staging uses `no-verify`
- [ ] Production environment: separate database, live Razorpay keys, approved WhatsApp
      templates
- [ ] Revisit this ADR: stay on these hosts, or move to AWS Mumbai with the existing Terraform

Expected pilot cost: roughly ₹2,500–3,000/month, mostly the database.
