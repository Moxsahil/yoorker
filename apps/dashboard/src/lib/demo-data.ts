/**
 * SAMPLE DATA for the screens whose backend arrives later: bookings (Sprint 3), payments and
 * earnings (Sprints 5-7), customers (Sprint 8). Seeded, so it looks the same on every load.
 * Court names come from the real venue when there is one.
 */

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Rohan",
  "Aarav",
  "Priya",
  "Vikram",
  "Ananya",
  "Kabir",
  "Sneha",
  "Arjun",
  "Ishaan",
  "Meera",
  "Rahul",
  "Neha",
  "Karan",
  "Simran",
  "Aditya",
  "Pooja",
  "Siddharth",
  "Riya",
  "Manav",
  "Tanvi",
];
const LAST = [
  "Sharma",
  "Verma",
  "Gupta",
  "Singh",
  "Mehta",
  "Kapoor",
  "Yadav",
  "Malik",
  "Chauhan",
  "Joshi",
  "Bansal",
  "Khanna",
  "Arora",
  "Saini",
  "Dahiya",
];

export type BookingLabel = "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type PaymentLabel = "PAID" | "NOT_PAID" | "REFUNDED";

export interface DemoBooking {
  id: string;
  customer: string;
  phone: string;
  court: string;
  date: string;
  start: string;
  minutes: number;
  pricePaise: number;
  booking: BookingLabel;
  payment: PaymentLabel;
  source: "ONLINE" | "WALK_IN";
}

export interface DemoCustomer {
  name: string;
  phone: string;
  bookings: number;
  spentPaise: number;
  lastPlayed: string;
  noShows: number;
  cancelled: number;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function people(random: () => number, count: number) {
  const used = new Set<string>();
  const list: { name: string; phone: string }[] = [];
  while (list.length < count) {
    const name = `${FIRST[Math.floor(random() * FIRST.length)]} ${LAST[Math.floor(random() * LAST.length)]}`;
    if (used.has(name)) continue;
    used.add(name);
    list.push({
      name,
      phone: `+91 9${String(Math.floor(random() * 1e9))
        .padStart(9, "0")
        .replace(/(\d{4})(\d{5})/, "$1 $2")}`,
    });
  }
  return list;
}

/** How many days of history the sample covers: enough for a 92-day range and the one before. */
export const SAMPLE_HISTORY_DAYS = 200;

const cache = new Map<string, DemoBooking[]>();

/**
 * Bookings from 200 days ago to 7 days ahead, around `today`. The pool of regular players
 * grows over time, so some customers book for the first time in any recent period.
 */
export function demoBookings(today: string, courts: string[]): DemoBooking[] {
  const key = `${today}|${courts.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const random = seeded(2026);
  const names = courts.length > 0 ? courts : ["Turf 1", "Turf 2", "Cricket ground"];
  const crowd = people(random, 220);
  const bookings: DemoBooking[] = [];
  for (let offset = -SAMPLE_HISTORY_DAYS; offset <= 7; offset++) {
    const date = addDays(today, offset);
    const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
    for (const court of names) {
      // A court holds one booking at a time: skip start times inside the previous booking.
      let freeFrom = 0;
      const cricket = /cricket/i.test(court);
      const hours = cricket ? [6, 12, 17.5, 21] : [6, 7, 8, 16, 17, 18, 19, 20, 21, 22];
      for (const hour of hours) {
        const busy = (hour >= 17 ? 0.8 : 0.35) + (weekend ? 0.15 : 0);
        if (random() > busy) continue;
        // Regulars first; newer players join the pool as the venue grows.
        const pool = Math.min(crowd.length, 30 + Math.floor((offset + SAMPLE_HISTORY_DAYS) * 0.95));
        const who =
          random() < 0.55 ? crowd[Math.floor(random() * 30)]! : crowd[Math.floor(random() * pool)]!;
        const minutes = cricket ? 210 : random() < 0.7 ? 60 : 90;
        if (hour * 60 < freeFrom) continue;
        freeFrom = hour * 60 + minutes;
        const rate = cricket ? 0 : hour >= 18 ? (weekend ? 1800 : 1600) : weekend ? 1800 : 1200;
        const price = cricket
          ? hour >= 21
            ? weekend
              ? 7000
              : 6000
            : hour >= 17
              ? weekend
                ? 6000
                : 5000
              : weekend
                ? 3500
                : 3000
          : Math.round((rate * minutes) / 60);
        const past = offset < 0;
        const roll = random();
        const booking: BookingLabel = past
          ? roll < 0.08
            ? "CANCELLED"
            : roll < 0.13
              ? "NO_SHOW"
              : "COMPLETED"
          : roll < 0.05
            ? "CANCELLED"
            : "CONFIRMED";
        const walkIn = random() < 0.25;
        const payment: PaymentLabel =
          booking === "CANCELLED"
            ? "REFUNDED"
            : walkIn && random() < (past ? 0.15 : 0.6)
              ? "NOT_PAID"
              : "PAID";
        const h = Math.floor(hour);
        bookings.push({
          id: `BK-${String(bookings.length + 1041).padStart(5, "0")}`,
          customer: who.name,
          phone: who.phone,
          court,
          date,
          start: `${String(h).padStart(2, "0")}:${hour % 1 ? "30" : "00"}`,
          minutes,
          pricePaise: price * 100,
          booking,
          payment,
          source: walkIn ? "WALK_IN" : "ONLINE",
        });
      }
    }
  }
  cache.set(key, bookings);
  return bookings;
}

export function demoCustomers(bookings: DemoBooking[], today: string): DemoCustomer[] {
  const map = new Map<string, DemoCustomer>();
  for (const b of bookings) {
    if (b.date > today || b.date < addDays(today, -60)) continue;
    const c = map.get(b.customer) ?? {
      name: b.customer,
      phone: b.phone,
      bookings: 0,
      spentPaise: 0,
      lastPlayed: b.date,
      noShows: 0,
      cancelled: 0,
    };
    c.bookings++;
    if (b.payment === "PAID") c.spentPaise += b.pricePaise;
    if (b.booking === "NO_SHOW") c.noShows++;
    if (b.booking === "CANCELLED") c.cancelled++;
    if (b.date > c.lastPlayed) c.lastPlayed = b.date;
    map.set(b.customer, c);
  }
  return [...map.values()].sort((a, b) => b.spentPaise - a.spentPaise);
}
