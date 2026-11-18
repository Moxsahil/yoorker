# Yoorker — PRD v1.1

**Owner:** MOX · **Status:** Draft (accepted after the turf visits, TURF-001) · **Updated:** 2026-11-18

## Problem

Small turfs and sports venues in Indian cities run on WhatsApp messages, phone calls and a
notebook. This causes double bookings, no-shows, unpaid shares and no record of revenue. Players
new to a city don't know which venues exist near them or what they cost.

## Vision

Booking a turf should feel as quick as ordering food: open a link or the app, see what's near
you, tap a slot, pay by UPI, done. For owners, Yoorker replaces the notebook — online bookings,
walk-ins and cash in one calendar.

## Where we launch

Yoorker works in **any Indian city**: owners anywhere can list a venue, and players see venues
near their location. The go-to-market starts with **3 pilot turfs in Gurugram**; other cities
grow from owner sign-ups and a city waitlist, not from active sales before launch.

## Users

| Persona              | Who                                         | Biggest pain                                               |
| -------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Rohan, organiser     | 26, plays every Saturday with 10 colleagues | Chasing friends for money; slots gone by the time he calls |
| Amit, turf owner     | 38, one turf with 2 courts in Sector 57     | Double bookings, no-shows, no idea of monthly revenue      |
| Sunil, staff         | 22, manages the turf in the evening         | Paper register; arguments over who booked first            |
| Priya, casual player | 23, new to her city (any city)              | Doesn't know which venues exist near her or what they cost |

## Core loops

- **Player:** open a WhatsApp link or a "near me" search, pick a slot and pay by UPI in under
  60 seconds.
- **Owner and staff:** every booking, walk-in and payment on one calendar; check players in at the
  gate; see what each court is doing right now.

## Product decisions

| Decision                     | What it means                                                                                                                                                   | Record          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Instant booking              | A paid booking is confirmed immediately. Owners never accept or reject bookings; they control supply by blocking slots and can cancel with an automatic refund. | Sprint Plan 1.2 |
| Two labels per booking       | **Booking:** Confirmed · Completed · Cancelled · No-show. **Payment:** Paid · Not paid · Refunded. The 5-minute payment hold shows only as "being booked".      | Sprint Plan 1.2 |
| Any city, Gurugram first     | Each venue belongs to a city taken from its map pin. New cities start "not live".                                                                               | RFC-003         |
| "Near me" discovery          | GPS → place name → nearby venues, bookable-soonest and nearest first; area or city search when location is off.                                                 | RFC-003         |
| Google sign-in until launch  | Phone OTP returns once SMS DLT and WhatsApp templates are approved.                                                                                             | ADR-0007        |
| Free hosting until the pilot | Supabase, Render, Cloudflare Pages and Vercel; paid, always-on hosting before real money.                                                                       | ADR-0006        |

## Owner dashboard

Thirteen sections, each shipped in the sprint that builds its backend and hidden from pilot
owners until it works: Overview, Bookings, Live board, Customers, Venues & courts, Availability &
pricing, Earnings & payouts, Offers & discounts, Analytics, Reviews, Marketing, Staff, Settings.
Notifications live behind a bell in the top bar. Staff see bookings and operations but never
money unless the owner allows it.

## Milestones

| Milestone                | Date       |
| ------------------------ | ---------- |
| Pilot (first real money) | 8 Feb 2027 |
| Public launch            | 3 May 2027 |

## Success metrics (by public launch, 3 May 2027)

| Layer       | Metric                              | Target   |
| ----------- | ----------------------------------- | -------- |
| Adoption    | Turfs live with 20+ bookings a week | 3        |
| Correctness | Double bookings reaching users      | 0        |
| Conversion  | Hold → paid                         | ≥ 70%    |
| Speed       | Time to book (returning player)     | < 60 s   |
| Operations  | Walk-ins logged in the app          | ≥ 80%    |
| Payments    | Split shares paid before deadline   | ≥ 85%    |
| Performance | Slot grid and nearby-search API p95 | < 300 ms |
| Reliability | API uptime                          | 99.9%    |

**Guardrail:** zero double bookings and a ledger that balances to the paisa are non-negotiable.

## Non-goals

- Coaching, tournaments, leagues
- Social feed / matchmaking
- Equipment rental, food orders
- Owner approval of each booking (request-to-book); reconsider after launch as a per-venue option
- Languages beyond English and Hindi

## Discovery findings

<!-- Fill in from turf visits (TURF-001): quotes in owners' own words -->

## Open questions

- ~~Dashboard host: Vercel or Cloudflare Pages~~ → Cloudflare Pages (ADR-0006)
- ~~Cities beyond Gurugram~~ → any city, Gurugram first (RFC-003)
- Production hosting from the pilot (decide in Sprint 5, see ADR-0006)
- Commercial host for `apps/web` before payments: Vercel Pro or Cloudflare Workers (Sprint 5)
- WhatsApp BSP choice
