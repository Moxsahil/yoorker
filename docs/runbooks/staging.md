# Staging

Free-tier staging for the build phase (ADR-0006). Nothing here holds real users, bookings or
money.

## Where everything lives

| Part            | URL                                    | Host                                 | Deploys                                 |
| --------------- | -------------------------------------- | ------------------------------------ | --------------------------------------- |
| API (NestJS)    | https://staging-api.yoorker.com        | Render `yoorker-api-staging`         | `deploy.yml`, after CI passes on `main` |
| Owner dashboard | https://staging-app.yoorker.com        | Cloudflare Pages `yoorker-dashboard` | Pages, on every push to `main`          |
| Player website  | https://staging.yoorker.com            | Vercel `yoorker-web`                 | Vercel, on every push to `main`         |
| Database        | Supabase `yoorker-staging` (Singapore) | Supabase Free                        | Migrations run by `deploy.yml`          |
| DNS, email      | `yoorker.com`, `hello@yoorker.com`     | Cloudflare                           | —                                       |

The API and the database are both in Singapore; the dashboard and website are served from
Cloudflare's and Vercel's edge, including India. PRs get preview URLs on Pages and Vercel;
previews cannot sign in, because only `https://staging-app.yoorker.com` is in `CORS_ORIGINS`.

DNS records (Cloudflare):

| Name          | Type  | Target                             | Proxy            |
| ------------- | ----- | ---------------------------------- | ---------------- |
| `staging-api` | CNAME | `yoorker-api-staging.onrender.com` | DNS only (grey)  |
| `staging-app` | CNAME | `yoorker-dashboard.pages.dev`      | Proxied (orange) |
| `staging`     | CNAME | value shown by Vercel              | DNS only (grey)  |

Render and Vercel issue their own certificates, so their records must stay grey.

## Secrets

| Secret                   | Where it is set                              | Used by                     |
| ------------------------ | -------------------------------------------- | --------------------------- |
| `STAGING_DATABASE_URL`   | GitHub → Settings → Environments → `staging` | `deploy.yml` migrations     |
| `RENDER_DEPLOY_HOOK_URL` | GitHub → Settings → Environments → `staging` | `deploy.yml` deploy trigger |
| `DATABASE_URL`           | Render → Environment                         | API runtime                 |
| `OTP_HASH_SECRET`        | Render → Environment                         | API runtime                 |
| `GOOGLE_CLIENT_IDS`      | Render → Environment                         | API runtime (not secret)    |
| `SENTRY_DSN`             | Render → Environment                         | API error reporting         |
| `R2_ACCESS_KEY_ID`       | Render → Environment                         | API photo uploads           |
| `R2_SECRET_ACCESS_KEY`   | Render → Environment                         | API photo uploads           |

The database URL is the Supabase **Session pooler** (port 5432, user
`postgres.<project-ref>`), never the Transaction pooler (6543) or the IPv6-only direct host.
It ends in `?sslmode=no-verify`: encrypted, but the certificate is not checked. Acceptable for
staging; production must verify it (see ADR-0006).

Other Render variables: `NODE_ENV=production`, `NODE_VERSION=22`, `API_PORT=10000`,
`CORS_ORIGINS=https://staging-app.yoorker.com`, `TRUST_PROXY_HOPS=1`, `LOG_LEVEL=info`,
`SENTRY_ENVIRONMENT=staging`, `R2_ACCOUNT_ID=<Cloudflare account ID>`,
`R2_PUBLIC_BUCKET=yoorker-staging-public`, `R2_PUBLIC_URL=https://staging-photos.yoorker.com`.
`PHONE_OTP_ENABLED` is left unset, so phone OTP is off (ADR-0007).

## Errors (Sentry)

Unexpected API errors (500s, crashes, unhandled rejections) go to the Sentry project
`yoorker-api`, tagged with the environment, the release (the deployed commit) and the request's
`x-request-id`; search Render's logs for that id to see the full request. Deliberate HTTP
errors (400, 401, 404, 409, the `/health` 503) are not reported. Cookies, auth headers, request
bodies and phone numbers are removed before an event is sent. Without `SENTRY_DSN` nothing is
reported.

## Photos (Cloudflare R2)

Venue photos live in the R2 bucket `yoorker-staging-public` (location APAC) and are served at
`https://staging-photos.yoorker.com` (bucket → Settings → Custom Domains). The dashboard asks the
API for a 10-minute upload link, sends the file straight to R2, then asks the API to add it; the
API never receives the file itself.

- **API token:** R2 → Manage API tokens, "Object Read & Write" on this bucket only.
- **CORS policy** (bucket → Settings): `PUT` from `https://staging-app.yoorker.com` and
  `http://localhost:5173`, headers `Content-Type` and `Cache-Control`.
- **Check the bucket by hand:** with the five `R2_*` variables in `.env`, run
  `cd services/api && R2_LIVE_TEST=1 pnpm vitest run src/photos/r2.live.test.ts`.

Without the `R2_*` variables the photo endpoints answer 503.

## How an API deploy works

1. A PR merges into `main`; CI runs on the merge commit.
2. When CI passes, `deploy.yml` runs migrations against Supabase, then calls the Render deploy
   hook with `&ref=<sha>`.
3. Render builds that commit and switches traffic only after `/health` answers.
4. The workflow waits until `/health` returns `"version": "<sha>"`, and fails after 15 minutes.

If migrations fail, nothing is deployed and the old version keeps running. Migrations run
before the new code, so each migration must work with the version still running.

**Manual redeploy of `main`:** GitHub → Actions → Deploy → Run workflow.

## When something goes wrong

### The API takes about a minute to answer

- **Symptoms:** first request after a quiet spell hangs for up to a minute.
- **Cause:** Render Free sleeps after about 15 minutes idle. Expected.
- **Fix:** wait. It goes away when the API moves to a paid instance before the pilot.

### `/health` returns 503 with `db: unreachable`

- **Check:** Supabase dashboard. Free projects pause after 7 days without activity.
- **Fix:** restore the project in Supabase, wait until it is Healthy, then call `/health` again.
- **If it is not paused:** compare the Render `DATABASE_URL` with the Session pooler string in
  Supabase → Connect. A reset database password must be updated in Render and in the GitHub
  `STAGING_DATABASE_URL` secret.

### The Deploy workflow fails

- **At "Migrate staging database":** read the error. Fix the migration in a new PR; never edit a
  migration that already ran (the runner checks checksums).
- **At "Trigger Render deploy":** a 401 or 404 means the hook URL is wrong or was regenerated.
  Copy it again from Render → Settings → Deploy Hook into the GitHub secret.
- **At "Wait for the new version":** open Render → Events / Logs for the failed build or a
  failing health check. The previous version keeps serving traffic.

### Roll back the API

Render → Deploys → pick the last good deploy → **Rollback**. Migrations do not roll back; if
the bad release included one, fix forward with a new migration.

### The dashboard or website did not update

Check the build in Cloudflare Pages (Deployments) or Vercel (Deployments) and use **Retry** /
**Redeploy**.

## Open items

- [ ] Confirm `TRUST_PROXY_HOPS=1` gives the real client IP behind Render (log `req.ip`
      against a known address) before phone OTP is turned on.
- [ ] Verify the Supabase certificate (`sslmode=verify-full` with Supabase's CA) before
      production.
