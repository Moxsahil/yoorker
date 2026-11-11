# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Yoorker is built by one engineer over 18 weeks. Decisions made in week 2 must still make sense
in week 16 and in the case-study write-up.

## Decision

Record every significant architecture decision as a short ADR in `docs/adr/`, numbered
sequentially, using the format: Context, Decision, Consequences. Big epics get an RFC in
`docs/rfc/` first; ADRs record the individual decisions that come out of them.

## Consequences

- Decisions are reviewable in PRs alongside code.
- A superseded ADR is never deleted; its status changes to "Superseded by ADR-XXXX".
