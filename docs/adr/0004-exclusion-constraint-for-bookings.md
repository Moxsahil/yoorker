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
