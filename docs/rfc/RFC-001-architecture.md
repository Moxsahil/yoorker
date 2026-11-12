# RFC-001: Architecture, data model, booking and payment flows

- **Author:** MOX
- **Status:** Draft
- **Created:** 2026-11-11
- **Related:** TURF-003, ADR-0002..0005

## Summary

One NestJS API container and one PostgreSQL database carry bookings, money and jobs.
Three clients (Next.js player web, React dashboard, Expo app later) talk to it over REST
typed by shared Zod contracts.

## Topology

| Part      | Stack                                    | Responsibility                                |
| --------- | ---------------------------------------- | --------------------------------------------- |
| web       | Next.js App Router, PWA                  | Venue pages, booking link, player account     |
| dashboard | React + Vite, TanStack Router/Query      | Owner calendar, staff mode, admin             |
| mobile    | Expo (Sprint 7, if needed)               | Player app                                    |
| api       | NestJS (Express)                         | REST, Razorpay webhooks, SSE, pg-boss workers |
| db        | RDS PostgreSQL 16 + PostGIS + btree_gist | Bookings, ledger, jobs, audit log             |
| outside   | R2, Razorpay, WhatsApp BSP, SMS (DLT)    | Files, payments/payouts, OTP, messages        |

## API modules

identity · venues · pricing · availability · booking · payments · ledger · notifications · live · audit

## Data model (first cut)

- `organisation`, `user`, `membership(role: OWNER|MANAGER|STAFF|PLAYER)`
- `venue(location geography(Point))`, `court(sport, surface, capacity, active)`
- `price_rule(kind, priority, days, start, end, amount_paise)`, `blackout(court_id, during)`
- `booking(court_id, during tstzrange, status, source, idempotency_key, hold_expires_at)`
- `payment(razorpay_order_id, razorpay_payment_id, status, amount_paise)`
- `ledger_entry(txn_id, account, debit_paise, credit_paise)` — sum(debit) = sum(credit) per txn
- `outbox(event, payload, published_at)`, `audit_log(actor, action, entity, before, after)`

All money is stored as integer paise. All times are stored in UTC and shown in IST.

## Booking flow

1. Player picks slot → `POST /bookings` with idempotency key.
2. Insert `HELD` with `hold_expires_at = now() + 5 min`; exclusion constraint rejects overlap → 409.
3. pg-boss job `hold.expire` is queued in the same transaction.
4. State machine: HELD → CONFIRMED → COMPLETED | CANCELLED (HELD → EXPIRED).

## Payment flow

1. `POST /bookings/:id/checkout` creates a Razorpay order for the held booking.
2. Player pays by UPI in Razorpay Checkout.
3. **Only the webhook confirms:** verify signature → dedupe by event id → in one transaction
   mark payment captured, booking CONFIRMED, write ledger entries (payment, platform fee,
   owner share), enqueue WhatsApp confirmation + 2-hour reminder.
4. Payment arriving after the hold expired and the slot was taken → automatic refund + message.
5. Nightly reconciliation compares Razorpay settlements with the ledger.

## Live updates

Booking changes `NOTIFY slot_changed`; the API fans out over SSE to open venue pages.

## Environments

| Environment             | Database                          | API                    | Web          | Dashboard        |
| ----------------------- | --------------------------------- | ---------------------- | ------------ | ---------------- |
| local                   | Docker Compose (PostGIS)          | `pnpm dev`             | `pnpm dev`   | `pnpm dev`       |
| staging (until pilot)   | Supabase Free, Singapore          | Render Free, Singapore | Vercel Hobby | Cloudflare Pages |
| production (from pilot) | Decided in Sprint 4, see ADR-0006 |                        |              |                  |

Hosting is free until the pilot (ADR-0006). The AWS Mumbai Terraform in `infra/terraform` is
kept for later and not applied.

## Open questions

- ~~Dashboard host: Vercel vs Cloudflare Pages~~ → Cloudflare Pages (ADR-0006)
- Production hosting from the pilot: stay on free-tier hosts' paid plans, or move to AWS Mumbai (decide in Sprint 4)
- WhatsApp BSP choice
