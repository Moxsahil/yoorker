# Yoorker — PRD v1

**Owner:** MOX · **Status:** Draft · **Updated:** 2026-11-11

## Problem

Small turfs in Gurugram run on WhatsApp messages, phone calls and a notebook. This causes
double bookings, no-shows, unpaid shares and no record of revenue.

## Vision

Booking a turf should feel as quick as ordering food: open a link, tap a slot, pay by UPI, done.
For owners, Yoorker replaces the notebook — online bookings, walk-ins and cash in one calendar.

## Users

| Persona              | Who                                         | Biggest pain                                               |
| -------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Rohan, organiser     | 26, plays every Saturday with 10 colleagues | Chasing friends for money; slots gone by the time he calls |
| Amit, turf owner     | 38, one turf with 2 courts in Sector 57     | Double bookings, no-shows, no idea of monthly revenue      |
| Sunil, staff         | 22, manages the turf in the evening         | Paper register; arguments over who booked first            |
| Priya, casual player | 23, new to the city                         | Doesn't know which turfs exist or what they cost           |

## Core loop

A player opens a WhatsApp link, picks a slot and pays by UPI in under 60 seconds.

## Success metrics (by public launch, 22 Mar 2027)

| Layer       | Metric                              | Target   |
| ----------- | ----------------------------------- | -------- |
| Adoption    | Turfs live with 20+ bookings a week | 3        |
| Correctness | Double bookings reaching users      | 0        |
| Conversion  | Hold → paid                         | ≥ 70%    |
| Speed       | Time to book (returning player)     | < 60 s   |
| Operations  | Walk-ins logged in the app          | ≥ 80%    |
| Payments    | Split shares paid before deadline   | ≥ 85%    |
| Performance | Slot grid API p95                   | < 300 ms |
| Reliability | API uptime                          | 99.9%    |

**Guardrail:** zero double bookings and a ledger that balances to the paisa are non-negotiable.

## Non-goals

- Coaching, tournaments, leagues
- Social feed / matchmaking
- Equipment rental, food orders
- Cities beyond Gurugram; languages beyond English and Hindi

## Discovery findings

<!-- Fill in from turf visits (TURF-001): quotes in owners' own words -->

## Open questions

- Dashboard host: Vercel or Cloudflare Pages (decide before Sprint 1)
