# RFC-001: Architecture, data model, booking and payment flows

- **Author:** MOX
- **Status:** Draft
- **Created:** 2026-11-11
- **Updated:** 2026-11-18: discovery module and city table (RFC-003), instant booking and
  booking/payment labels (Sprint Plan v1.2)
- **Related:** TURF-003, ADR-0002..0007, RFC-003

## Summary

One NestJS API container and one PostgreSQL database carry bookings, money and jobs.
Three clients (Next.js player web, React dashboard, Expo app later) talk to it over REST
typed by shared Zod contracts.

## Topology

| Part      | Stack                                              | Responsibility                                         |
| --------- | -------------------------------------------------- | ------------------------------------------------------ |
| web       | Next.js App Router, PWA                            | Venue pages, city pages, nearby search, player account |
| dashboard | React + Vite, TanStack Router/Query                | Owner calendar, staff mode, admin                      |
| mobile    | Expo (Sprint 10, if needed)                        | Player app                                             |
| api       | NestJS (Express)                                   | REST, Razorpay webhooks, SSE, pg-boss workers          |
| db        | PostgreSQL 16 + PostGIS + btree_gist               | Bookings, ledger, jobs, audit log, venue locations     |
| outside   | R2, Razorpay, WhatsApp BSP, SMS (DLT), Google Maps | Files, payments/payouts, OTP, messages, places         |

## API modules

identity · venues · discovery · pricing · availability · booking · payments · ledger ·
notifications · live · audit

## Data model (first cut)

- `organisation`, `app_user` (`user` is reserved in Postgres), `membership(role: OWNER|MANAGER|STAFF)`;
  a player is any signed-in user and has no membership row
- `city(slug, name, state, centroid, is_live)`; one row per name and state (RFC-003)
- `venue(city_id, location geography(Point), locality, pincode, rules[])`, `venue_photo`,
  `court(sports[], surface, capacity, active, start_step_minutes)`; one court can host several sports
- `opening_hours(court_id, weekday, opens_minute, closes_minute)` in local time, windows may run
  past midnight; `court_duration(court_id, minutes, label, sport, price_paise)` lists the booking
  lengths a court offers (1 h football, 3 h 30 m T20); see TURF-206
- `price_rule(court_id, name, weekdays[] | on_date, from_minute, to_minute, minutes, unit, price_paise, priority)`
  and `court.base_price_per_hour_paise`, set by each owner (TURF-201). A booking's price is a
  whole-booking rule for its length and start, else the length's package price, else each
  15 minutes at the matching per-hour rule or the base price. A date rule beats weekday rules;
  then the higher priority wins.
- `blackout(court_id, during tstzrange, reason, note, created_by)`: one-off blocks (maintenance,
  private event, holiday), never overlapping on a court; staff may add them, owners and managers
  may remove any (TURF-203)
- `booking(court_id, during tstzrange, status, source, idempotency_key, hold_expires_at)`
- `payment(razorpay_order_id, razorpay_payment_id, status, amount_paise)`
- `ledger_entry(txn_id, account, debit_paise, credit_paise)` — sum(debit) = sum(credit) per txn
- `outbox(event, payload, published_at)`, `audit_log(actor, action, entity, before, after)`

All money is stored as integer paise. All times are stored in UTC and shown in IST.

## Booking flow

Booking is **instant**: a paid booking is confirmed without owner approval. Owners control
supply by blocking slots and can cancel with an automatic refund.

1. Player picks slot → `POST /bookings` with idempotency key.
2. Insert `HELD` with `hold_expires_at = now() + 5 min`; exclusion constraint rejects overlap → 409.
3. pg-boss job `hold.expire` is queued in the same transaction.
4. Booking states: HELD → CONFIRMED → COMPLETED | CANCELLED | NO_SHOW (HELD → EXPIRED).
5. Staff walk-ins are created CONFIRMED with `source = WALK_IN`; their payment stays not paid
   until cash is recorded.

Every booking shows **two labels**:

| Booking label | State                        | Payment label | Meaning                             |
| ------------- | ---------------------------- | ------------- | ----------------------------------- |
| Being booked  | HELD (5-minute hold only)    | Paid          | Money received (UPI, card, cash)    |
| Confirmed     | CONFIRMED, upcoming          | Not paid      | Walk-in to pay at the counter       |
| Completed     | COMPLETED, they played       | Refunded      | Money returned after a cancellation |
| Cancelled     | CANCELLED                    |               |                                     |
| No-show       | NO_SHOW, ground stayed empty |               |                                     |

## Payment flow

1. `POST /bookings/:id/checkout` creates a Razorpay order for the held booking.
2. Player pays by UPI in Razorpay Checkout.
3. **Only the webhook confirms:** verify signature → dedupe by event id → in one transaction
   mark payment captured, booking CONFIRMED, write ledger entries (payment, platform fee,
   owner share), enqueue WhatsApp confirmation + 2-hour reminder.
4. Payment arriving after the hold expired and the slot was taken → automatic refund + message.
5. Nightly reconciliation compares Razorpay settlements with the ledger.

## Discovery

Players find venues near them in any city; the API receives only coordinates and answers with a
two-phase PostGIS query (radius + sport filter, then next free slots). See RFC-003.

## Live updates

Booking changes `NOTIFY slot_changed`; the API fans out over SSE to open venue pages.

## Environments

| Environment             | Database                          | API                    | Web          | Dashboard        |
| ----------------------- | --------------------------------- | ---------------------- | ------------ | ---------------- |
| local                   | Docker Compose (PostGIS)          | `pnpm dev`             | `pnpm dev`   | `pnpm dev`       |
| staging (until pilot)   | Supabase Free, Singapore          | Render Free, Singapore | Vercel Hobby | Cloudflare Pages |
| production (from pilot) | Decided in Sprint 5, see ADR-0006 |                        |              |                  |

Hosting is free until the pilot (ADR-0006). The AWS Mumbai Terraform in `infra/terraform` is
kept for later and not applied.

## Open questions

- ~~Dashboard host: Vercel vs Cloudflare Pages~~ → Cloudflare Pages (ADR-0006)
- Production hosting from the pilot: stay on free-tier hosts' paid plans, or move to AWS Mumbai (decide in Sprint 5)
- WhatsApp BSP choice
