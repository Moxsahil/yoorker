# ADR-0002: One PostgreSQL database for bookings, money and jobs

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

A booking, its payment record and its reminder job must commit or fail together. Splitting them
across stores (Redis queue, separate payments DB) would trade one transaction for
distributed-consistency work one engineer cannot afford.

## Decision

Use a single PostgreSQL 16 instance (AWS RDS, ap-south-1) with `btree_gist` and `postgis`.
Background jobs use pg-boss (queue in Postgres); live updates use LISTEN/NOTIFY → SSE;
events use an outbox table. Access via Kysely + plain SQL migrations.

No Redis, message broker or search engine until a named trigger is hit:

- Redis: hundreds of req/s on the slot grid
- Broker: other services need booking events
- Search engine: text relevance across hundreds of venues

## Consequences

- Bookings, ledger entries and jobs are atomic.
- Postgres is a single point of failure → Multi-AZ in production, tested restore drill.
- Modules never query another module's tables, so Payments can split out later.
