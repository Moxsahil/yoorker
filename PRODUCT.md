# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Two web apps share this file: the player web app (`apps/web`, Next.js PWA, phone-first) and the
owner dashboard (`apps/dashboard`, Vite + React).

## Users

- **Organiser (Rohan, 26).** Plays every Saturday with about 10 colleagues. Books the slot and
  then has to chase friends for their share of the money. When he phones a turf, the slot has
  often gone already.
- **Turf owner (Amit, 38).** Runs one turf with 2 courts (Sector 57, Gurugram). His problems are
  double bookings, no-shows and not knowing his monthly revenue. He uses the dashboard on a phone
  at the ground and on a laptop for money and reports.
- **Staff (Sunil, 22).** Runs the turf in the evening. Today he keeps a paper register, and there
  are arguments over who booked first. He works on a phone at the ground, logging walk-ins and
  cash.
- **Casual player (Priya, 23).** New to the city. She doesn't know which turfs exist nearby or
  what they cost.

## Product Purpose

Small turfs run on WhatsApp messages, phone calls and a notebook. That leads to double bookings,
no-shows, unpaid shares and no record of revenue.

- **For players:** booking should feel as quick as ordering food. Open a link, tap a slot, pay by
  UPI, done, in under 60 seconds.
- **For owners:** Yoorker replaces the notebook. Online bookings, walk-ins and cash sit in one
  calendar.

Targets by public launch (3 May 2027):

- 3 turfs live, each with 20+ bookings a week.
- Zero double bookings reach users.
- At least 70% of holds turn into paid bookings.
- A returning player books in under 60 seconds.
- At least 80% of walk-ins are logged in the app.
- At least 85% of split shares are paid before the deadline.

## Positioning

- **WhatsApp-link-first, UPI-native booking.** The core loop starts from a link shared in a
  group chat, not from an app store.
- **One calendar for the owner** that holds online, walk-in and cash bookings together.
- **Correctness is the product promise.** The database itself prevents overlapping bookings,
  and the money ledger balances to the paisa.

## Operating Context

- **Pilot and launch dates:** the pilot starts 8 Feb 2027 and the public launch is 3 May 2027.
- **Where it runs:** Gurugram is the launch and pilot city, but the product works in any Indian
  city. Owners anywhere can list venues. Players see venues near their location, delivery-app
  style: GPS first, then a place name, then the nearby list, with area or city search as a
  fallback. If nothing is nearby, the player can join a city waitlist.
- **Pilot booking path:** in the pilot, players arrive mainly through direct WhatsApp links.
  Full nearby discovery lands later (Sprint 7).
- **Payments:** Razorpay with UPI, split payments and refunds. Money is integer paise.
- **Times:** stored in UTC and shown in IST.
- **Owner dashboard sections:**
  - Overview (the first page after login)
  - Operations: Bookings, Live Board, Customers
  - Setup: Venues & Courts, Availability & Pricing
  - Money: Earnings & Payouts, Offers & Discounts
  - Growth: Analytics & Reports, Reviews & Ratings, Marketing
  - Account: Staff, Settings

  Notifications live in the top bar. On phone the bottom navigation is
  Home / Bookings / Live / Venues / More.

- **Staff access:** staff see a reduced dashboard (no money, no customer spending, venues view
  only). Owners can grant extra permissions per person and per venue. Sections that aren't
  finished are hidden from pilot owners with feature flags.

## Capabilities and Constraints

- **Instant booking.** A paid booking is Confirmed straight away. There is no owner
  accept/reject step and no "Rejected" status.
- **Every booking carries two labels:**
  - Booking status: Confirmed (upcoming), Completed (played), Cancelled (the user cancels and is
    refunded), No-show (the team didn't come).
  - Payment status: Paid, Not paid, Refunded.

  The 5-minute payment hold is shown only as "being booked".

- **Earnings** always show booking value, Yoorker commission, refunds and net as separate lines.
- **Sign-in:** Google sign-in until money goes live (ADR-0006, ADR-0007), plus phone OTP.
- **Privacy:** a player's exact location is never stored (DPDP Act).
- **Maps:** Google Maps (Maps JS, Places, Geocoding).
- **Language:** English only at the pilot and the public launch. Hindi comes later.
- **Non-goals:**
  - coaching, tournaments and leagues;
  - a social feed or matchmaking;
  - equipment rental and food orders.
- **Undecided:**
  - ratings-based ranking (TURF-802);
  - customer loyalty;
  - fully automatic demand pricing.

## Brand Commitments

- **Name:** Yoorker.
- **Tagline:** "Book the exact slot you want, like a yorker lands right on target."
- **Approval before code:** every screen is shown as a prototype and approved before it is coded.
- **Matching references:** when MOX supplies reference images, the design copies their colours,
  components and spacing exactly, not a reinterpretation.
- **Icons:** never use emoji as icons.

## Evidence on Hand

- **Docs:** the PRD (`docs/prd.md`), RFC-001 and ADRs in `docs/`.
- **Approved owner dashboard prototype (v6):** https://claude.ai/artifact/AnW48Nt2ewtEwcHw5sA151
- **Not available yet:**
  - no real customer testimonials, turf partners, ratings, pricing or usage numbers;
  - turf-visit discovery findings (TURF-001) are not yet written up.

  Do not invent any of these. Sample venues such as "Green Arena" are demo data only.

## Product Principles

1. **Speed is the feature.** Every player step serves "link to paid in under 60 seconds".
2. **Never wrong about slots or money.** Availability, booking status and payment status must be
   unambiguous. A double booking or an unbalanced ledger is a failure, whatever the design.
3. **Built for the ground, not just the desk.** Owner and staff flows must work one-handed on a
   phone at a busy turf, and scale up to a laptop for money and reports.
4. **Replace the notebook, don't add work.** Walk-ins and cash must be quicker to log in Yoorker
   than on paper.
5. **Any city, Gurugram first.** Never hard-code a city or its boundaries.
