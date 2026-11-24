# ADR-0004: Prevent double bookings with a Postgres exclusion constraint

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Double bookings reaching a user is the one failure Yoorker cannot have. App-level checks
("SELECT then INSERT") race under concurrency; app-level locks break across containers.

## Decision

Store each booking's time as `during tstzrange` and enforce:

    ALTER TABLE booking
      ADD CONSTRAINT booking_no_overlap
      EXCLUDE USING gist (court_id WITH =, during WITH &&)
      WHERE (status IN ('HELD', 'CONFIRMED'));

The database is the only source of truth. The API maps the exclusion violation
(SQLSTATE 23P01) to HTTP 409 "slot taken".

## Consequences

- Overlaps are impossible regardless of app bugs or concurrency.
- Expired holds must leave the constraint's scope (status change) before the slot frees up;
  a conflicting insert first expires stale holds.
- A CI concurrency test fires 100 parallel requests at one slot and asserts exactly 1 booking.

## Implementation (TURF-301, TURF-306, migration 0011)

- Booking labels: `status` (HELD, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW, EXPIRED) and
  `payment_status` (NOT_PAID, PAID, REFUNDED). A trigger allows only these moves:
  HELD → CONFIRMED / CANCELLED / EXPIRED; CONFIRMED → COMPLETED / CANCELLED / NO_SHOW;
  NOT_PAID → PAID → REFUNDED (refunds only on cancelled bookings). `BOOKING_MOVES` and
  `PAYMENT_MOVES` in `@yoorker/db` mirror it, and a test checks every pair against the database.
- Online bookings start as unpaid holds; desk bookings (walk-in, phone) may start confirmed.
  A booking's court and time never change.
- Blocks and bookings are in two tables, so triggers on both take a per-court advisory lock
  and refuse the overlap: a booking in blocked time fails with `YK001`, a block over a live
  booking with `YK002` (the API answers 409: cancel the booking first). Holds past their expiry
  don't stop a block. Bad status moves fail with `YK003`.
- The price is stored on the booking when it is made (`price_paise`, `price_source`,
  `price_rule_name`), so later price changes never touch existing bookings.
