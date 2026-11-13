# Yoorker

> Book the exact slot you want, like a yorker lands right on target.

Turf booking and operations platform for Gurugram. Players book and pay by UPI from a WhatsApp
link in under 60 seconds; owners run online bookings, walk-ins and cash from one calendar.

## Stack

| Layer           | Choice                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Player web      | Next.js (App Router), PWA                                                                                                          |
| Owner dashboard | React + Vite, TanStack Router + Query                                                                                              |
| API             | NestJS (Express), modular monolith                                                                                                 |
| Database        | PostgreSQL 16 + PostGIS + btree_gist, Kysely                                                                                       |
| Jobs / live     | pg-boss, LISTEN/NOTIFY → SSE                                                                                                       |
| Payments        | Razorpay (UPI, webhooks, Route)                                                                                                    |
| Hosting         | Supabase, Render, Vercel, Cloudflare Pages + R2 (free until pilot, see [ADR-0006](docs/adr/0006-zero-cost-hosting-until-pilot.md)) |

## Repo layout

```
apps/web            Player web (Next.js)
apps/dashboard      Owner dashboard (Vite + React)
services/api        API (NestJS)
packages/config     Shared tsconfig
packages/contracts  Zod API contracts
packages/db         Kysely + SQL migrations
packages/tokens     Design tokens
packages/ui         Shared UI components
infra/terraform     AWS + Cloudflare infrastructure (deferred, see ADR-0006)
docs/               PRD, RFCs, ADRs, runbooks
```

## Getting started

Requirements: Node 22 (`nvm use`), pnpm 11, Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up          # Postgres + PostGIS on :5432
pnpm dev            # web :3000 · dashboard :5173 · api :4000
```

Health check: http://localhost:4000/health

## Scripts

| Command                                      | What it does               |
| -------------------------------------------- | -------------------------- |
| `pnpm dev`                                   | Run all apps in watch mode |
| `pnpm build`                                 | Build everything           |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks across the monorepo |
| `pnpm check`                                 | Everything CI runs         |
| `pnpm format`                                | Prettier                   |

## Conventions

- Branch from `main`, open a PR; CI must be green to merge.
- Conventional commits, enforced by commitlint: `feat(api): phone OTP login (TURF-101)`.
- Git hooks (Husky): lint-staged on commit, typecheck + tests on push.
- Money is integer paise; times are stored in UTC and shown in IST.
- The database enforces the rules that must never break (no overlapping bookings).

## Docs

- [PRD](docs/prd.md)
- [RFC-001: Architecture](docs/rfc/RFC-001-architecture.md)
- [ADRs](docs/adr/)
- [Runbooks](docs/runbooks/README.md)
- [Infrastructure](infra/terraform/README.md)
