# RFC-003: Discovery and location search

- **Author:** MOX
- **Status:** Accepted
- **Created:** 2026-11-18
- **Related:** TURF-009, TURF-108, TURF-204, TURF-701, TURF-704, TURF-706, TURF-707, RFC-001

## Summary

Players find sports venues near them, in any Indian city, the way delivery apps find nearby
stores: the browser's location becomes a place name, and the API returns venues within a radius,
bookable-soonest and nearest first. Owners pin each venue on Google Maps, and the venue is saved
with its city, locality and PIN code. Everything runs on the existing Postgres + PostGIS; no new
infrastructure is added until the numbers require it.

## Problem / motivation

v1.0 of the plan was Gurugram-only. Owners in other cities should be able to list venues, and a
player should see venues near where they stand without knowing the venue's name. The pilot
uses direct WhatsApp links, so the full search ships in Sprint 9, but venue data has to carry its
city from day one (TURF-108).

## Goals and non-goals

**Goals**

1. Detect location (GPS) or let the player search an area or pick a city.
2. Show nearby venues with distance, filtered by sport, date and time; "free at 6 PM" on each card.
3. City and sport pages for Google (`/turfs/[city]/[sport]`).
4. A useful empty state and waitlist where we have no venues yet.
5. Nearby list p95 under 300 ms; slot availability live.
6. Never store a player's exact location (DPDP Act).

**Non-goals**

- Delivery-style service zones: the player travels to the venue, so a radius is enough.
- Demand-based automatic ranking or pricing before launch.
- A search engine, Redis or a read replica before the numbers require them.

## Proposed design

### Architecture

```
Player browser / Expo app
  GPS (navigator.geolocation) · Google Places autocomplete · reverse geocode → "Baner, Pune"
  (browser key, restricted to our domains) · last location remembered on the device
        │ lat, lng, sport, date                       │ page requests
        ▼                                             ▼
  CDN (Vercel / Cloudflare) ◄──────────────── Next.js player web
  caches city and venue pages (ISR)           /  /turfs/[city]/[sport]  /[slug]
        │ REST, typed by @yoorker/contracts
        ▼
  NestJS API: discovery · availability · booking · live (SSE)
        ▼
  PostgreSQL + PostGIS: city · venue(location + GiST, city_id) · court(sports[])
  opening_hours · price_rule · blackout · booking(exclusion constraint) · city_waitlist
        ▲
  Owner dashboard: pin on Google Maps → geocode → city, locality, PIN saved (TURF-108)
```

The API only ever receives coordinates. Turning coordinates into a place name and address
autocomplete happen in the browser with a domain-restricted Google key.

### Data model

Built in TURF-108 (migration `0005_venue_city.sql`):

- `city(id, slug, name, state, centroid geography(Point), is_live, created_at)`; one row per
  name and state, ignoring case. Gurugram is seeded live; other cities are created the first
  time an owner lists a venue there and start not live. A same-named city in another state
  gets a state-suffixed slug (`aurangabad-bihar`).
- `venue` gains `city_id` (required), `locality`, `pincode` (6-digit Indian PIN) and `rules`.
- `venue.location` already has a GiST index.

Added with discovery (Sprint 9):

- GIN index on `court.sports` for the sport filter.
- `city_waitlist(city_slug, contact, created_at)`.

### API

```
GET  /discover/venues?lat=&lng=&radiusKm=10&sport=FOOTBALL&date=&limit=20&cursor=
     → { area: { radiusKm, expanded }, venues: [{ slug, name, locality, city, distanceKm,
         sports, courts, priceFromPaise, nextFree: ["18:00", "19:00"], photo }], nextCursor }
GET  /cities
GET  /venues/:slug
GET  /venues/:slug/slots?date=        (+ SSE for live updates)
POST /cities/:slug/waitlist
```

All are public, rate-limited per IP, with a maximum radius of 50 km and at most 50 results.

### Query (two phases)

```sql
-- Phase 1: geo + sport filter (GiST on venue.location, GIN on court.sports)
SELECT v.id, v.slug, v.name, v.locality, c.name AS city,
       ST_Distance(v.location, :point) / 1000 AS km
FROM venue v
JOIN city c ON c.id = v.city_id
JOIN court ct ON ct.venue_id = v.id AND ct.is_active
WHERE v.is_active
  AND ST_DWithin(v.location, :point, :radius_m)               -- 5 → 10 → 25 km
  AND (:sport IS NULL OR ct.sports @> ARRAY[:sport]::sport[])
GROUP BY v.id, c.name
ORDER BY v.location <-> :point                                -- index-assisted nearest-first
LIMIT 20;

-- Phase 2: next 3 free slots for those ≤ 20 venues only
-- (opening hours − bookings − blackouts, from the slot grid in TURF-204)
```

**Ranking v1:** venues with a free slot in the next 3 hours first, then distance. **v2:** add
ratings (TURF-802); later popularity and "played here before".

When nothing is within the radius, widen 5 → 10 → 25 km. If still empty, show "We're not in
your city yet" with a waitlist.

### Caching

| Data                 | Cached where                                               | Freshness                    |
| -------------------- | ---------------------------------------------------------- | ---------------------------- |
| City and sport pages | CDN (ISR)                                                  | ~10 min or on venue change   |
| Venue page           | CDN (ISR)                                                  | rebuilt when the owner edits |
| Nearby list          | API cache keyed by rounded location (~1 km) + sport + date | 30–60 s                      |
| Slot availability    | not cached for the grid; pushed by SSE                     | real time                    |

### Flows (sequence)

1. Player opens yoorker.com. A remembered location shows "Baner, Pune" and the nearby list at
   once; otherwise "Use my location" asks for permission.
2. Allowed: coordinates → reverse geocode in the browser → `GET /discover/venues`.
   Denied or failed: area search or city picker.
3. Player taps a venue → `/[slug]` (CDN page) with the live slot grid → hold → UPI → confirmed.

### Failure modes

| Risk                              | Design answer                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------- |
| GPS denied or inaccurate          | Area or city search; "Change location" always visible                           |
| Owner pin in the wrong place      | Places search, pin preview, pasted Google Maps link; players can report it      |
| Google API cost grows             | Domain-restricted keys, autocomplete session tokens, names cached on the device |
| A slot shown free was just booked | The hold hits the exclusion constraint → "just taken"; SSE refreshes the grid   |
| Scraping public endpoints         | Per-IP rate limit, maximum radius and result count                              |
| An empty city looks dead          | Radius widening, then waitlist; cities open as venues sign up                   |

### Scaling path

| Stage           | When                           | Add                                               |
| --------------- | ------------------------------ | ------------------------------------------------- |
| 1. Now → launch | up to ~5,000 venues            | Postgres + PostGIS + indexes + in-memory cache    |
| 2. Growth       | thousands of searches a minute | Redis for the nearby cache; a read replica        |
| 3. Rich search  | text search, many filters      | Typesense or Elasticsearch, fed from the outbox   |
| 4. Many cities  | national scale                 | H3 cells for demand heatmaps; per-region sharding |

## Alternatives considered

- **Delivery-style service polygons** (Swiggy, Blinkit): needed when riders travel to the
  customer; here the player travels, so a radius is simpler and enough.
- **Geocoding on the server:** adds latency and makes the API handle player addresses. The
  browser does it with a restricted key, and the API never learns a place name.
- **A search engine from day one:** extra infrastructure and sync work for a few thousand
  venues that PostGIS answers in milliseconds.

## Rollout

| Piece                                                   | Ticket                  | Sprint |
| ------------------------------------------------------- | ----------------------- | ------ |
| City table; venue city, locality, PIN code, rules       | TURF-108 (done)         | 1      |
| Next-free-slots in the slot grid API                    | TURF-204                | 2      |
| `slot_changed` events for SSE                           | TURF-307                | 3      |
| Venue page at `/[slug]`                                 | TURF-205                | 4      |
| Search demand by area; ratings for ranking v2           | TURF-604, TURF-802      | 8      |
| Nearby API, location bar, city pages + waitlist, caches | TURF-701, 706, 707, 704 | 9      |
| Load test including discovery, SEO launch checklist     | TURF-803, TURF-806      | 11     |

The nearby API ships behind a feature flag: staff first, then everyone.

## Open questions

- Default radius per city size (10 km may be too large for Mumbai, too small for smaller cities).
- When a city flips to `is_live`: a fixed number of venues, or a manual decision.
