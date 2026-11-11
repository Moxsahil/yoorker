# ADR-0003: NestJS on the Express adapter, as a modular monolith

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The API has clear domains (identity, venues, pricing, availability, booking, payments, ledger,
notifications, live, audit) and is built by one developer at pilot scale.

## Decision

NestJS with its default Express adapter, one Nest module per domain, deployed as one container.
Modules communicate only through exported services, never through each other's tables.

Fastify was not chosen: a booking spends its time in Postgres, Razorpay and WhatsApp, not in
the HTTP framework, and Express has the widest middleware compatibility (Razorpay raw-body
webhooks, Sentry).

## Consequences

- One deploy, one transaction boundary.
- Module boundaries are enforced by convention + lint rules, not network calls.
