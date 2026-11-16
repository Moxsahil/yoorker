# ADR-0007: Google sign-in until the money launch, phone OTP later

- **Status:** Accepted
- **Date:** 2026-11-16
- **Amends:** TURF-101, ADR-0006 (WhatsApp OTP and SMS rows), RFC-001 § Data model

## Context

TURF-101 plans phone OTP sign-in over WhatsApp with a DLT-registered SMS fallback. Neither
the WhatsApp template nor the DLT registration has been applied for, and both take weeks.
Until then the API only logs OTP codes, so nobody outside development can sign in.

## Decision

- Until the money launch, users sign in with **Google** (`POST /auth/google`). The client
  gets an ID token from Google Identity Services. The API checks its signature, expiry,
  issuer and audience (`GOOGLE_CLIENT_IDS`) and starts the usual httpOnly cookie session.
- A Google account must have a verified email. Google has already verified it, so Yoorker
  sends no email code of its own.
- After the first sign-in, clients ask for a mobile number (`PATCH /auth/me`). It is saved
  as **unverified** (`phone_verified_at` is null). An email cannot prove a phone number.
- A phone number is unique only once verified, so nobody can block the real owner by typing
  their number first.
- Sign-in methods live in `user_identity` (provider, subject), separate from `app_user`.
  Google's stable `sub` is the key, never the email.
- Facebook login is not built. Until Meta reviews the app only testers can use it, and
  many Indian accounts return no email.
- Phone OTP stays in the code. It is off in production by default (`PHONE_OTP_ENABLED`),
  because the log sender only prints codes.

## Consequences

- Sign-in costs nothing and needs no vendor approval.
- Until phone OTP is live, no feature may trust `phone` as proof of identity.
  WhatsApp messages can go to a typed-in number, but split-payment links and walk-in
  lookups must not treat it as verified.
- An OTP sign-in today creates a separate user, even if a Google user typed the same number.

## Before the money launch

- [ ] Real WhatsApp and SMS senders behind `OTP_SENDER`; `PHONE_OTP_ENABLED=true`
- [ ] A signed-in Google user verifies their number by OTP. That sets `phone_verified_at` on
      **their** user, and an unverified copy of the number on other users is cleared
- [ ] Ask every existing user to verify their number once
- [ ] Decide whether booking or paying needs a verified number
