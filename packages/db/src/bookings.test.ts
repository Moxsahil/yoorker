import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { point } from "./geo";
import {
  BOOKING_MOVES,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  PAYMENT_MOVES,
  PAYMENT_STATUSES,
  PRICE_SOURCES,
  type BookingStatus,
  type Database,
} from "./schema";
import { startTestDatabase, type TestDatabase } from "./testing";
import type { Insertable } from "kysely";

let t: TestDatabase;
let courtId: string;
let playerId: string;
let slot = 0;

beforeAll(async () => {
  t = await startTestDatabase();
  const org = await t.db
    .insertInto("organisation")
    .values({ name: "Green Arena" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const city = await t.db
    .selectFrom("city")
    .select("id")
    .where("slug", "=", "gurugram")
    .executeTakeFirstOrThrow();
  const venue = await t.db
    .insertInto("venue")
    .values({
      organisation_id: org.id,
      city_id: city.id,
      slug: "green-arena-bookings",
      name: "Green Arena",
      address: "Sector 57, Gurugram, Haryana",
      location: point(77.0878, 28.4211),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const court = await t.db
    .insertInto("court")
    .values({
      venue_id: venue.id,
      name: "Turf 1",
      sports: ["FOOTBALL"],
      surface: "ARTIFICIAL_TURF",
      capacity: 14,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  courtId = court.id;
  const player = await t.db
    .insertInto("app_user")
    .values({ phone: "+919811100055", name: "Rohan Sharma" })
    .returning("id")
    .executeTakeFirstOrThrow();
  playerId = player.id;
});

afterAll(async () => {
  await t?.stop();
});

const range = (from: string, to: string) =>
  sql<string>`tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')`;

function nextHour() {
  slot += 1;
  const start = new Date(Date.UTC(2027, 0, 1) + slot * 3_600_000);
  return { from: start.toISOString(), to: new Date(start.getTime() + 3_600_000).toISOString() };
}

function book(values: Partial<Insertable<Database["booking"]>> & { from: string; to: string }) {
  const { from, to, ...rest } = values;
  return t.db
    .insertInto("booking")
    .values({
      court_id: courtId,
      during: range(from, to),
      minutes: (new Date(to).getTime() - new Date(from).getTime()) / 60_000,
      sport: "FOOTBALL",
      source: "ONLINE",
      hold_expires_at: new Date(Date.now() + 5 * 60_000),
      player_id: playerId,
      price_paise: 120_000,
      price_source: "HOURLY",
      ...rest,
    })
    .returning(["id", "number", "status", "payment_status"])
    .executeTakeFirstOrThrow();
}

function block(from: string, to: string) {
  return t.db
    .insertInto("blackout")
    .values({ court_id: courtId, during: range(from, to), reason: "MAINTENANCE" })
    .execute();
}

const setStatus = (id: string, status: BookingStatus) =>
  t.db.updateTable("booking").set({ status }).where("id", "=", id).execute();

async function enumValues(type: string): Promise<string[]> {
  const { rows } = await sql<{ v: string }>`
    SELECT unnest(enum_range(NULL::${sql.raw(type)}))::text AS v
  `.execute(t.db);
  return rows.map((r) => r.v);
}

describe("bookings (TURF-301, TURF-306)", () => {
  it("keeps TypeScript enum lists in sync with Postgres", async () => {
    expect(await enumValues("booking_status")).toEqual([...BOOKING_STATUSES]);
    expect(await enumValues("payment_status")).toEqual([...PAYMENT_STATUSES]);
    expect(await enumValues("booking_source")).toEqual([...BOOKING_SOURCES]);
    expect(await enumValues("price_source")).toEqual([...PRICE_SOURCES]);
  });

  it("never lets two live bookings on one court overlap", async () => {
    await book({ from: "2026-12-19T12:30Z", to: "2026-12-19T13:30Z" });
    await expect(book({ from: "2026-12-19T13:00Z", to: "2026-12-19T14:00Z" })).rejects.toThrow(
      /booking_no_overlap/,
    );
    await book({ from: "2026-12-19T13:30Z", to: "2026-12-19T14:30Z" });
  });

  it("frees the time once a booking is cancelled or its hold expires", async () => {
    const cancelled = await book({ from: "2026-12-20T12:30Z", to: "2026-12-20T13:30Z" });
    await setStatus(cancelled.id, "CANCELLED");
    const expired = await book({ from: "2026-12-20T12:30Z", to: "2026-12-20T13:30Z" });
    await setStatus(expired.id, "EXPIRED");
    await book({ from: "2026-12-20T12:30Z", to: "2026-12-20T13:30Z" });
  });

  it("allows exactly the booking status changes listed in BOOKING_MOVES", async () => {
    const pathTo: Record<BookingStatus, BookingStatus[]> = {
      HELD: [],
      CONFIRMED: ["CONFIRMED"],
      COMPLETED: ["CONFIRMED", "COMPLETED"],
      CANCELLED: ["CANCELLED"],
      NO_SHOW: ["CONFIRMED", "NO_SHOW"],
      EXPIRED: ["EXPIRED"],
    };
    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES.filter((s) => s !== from)) {
        const { id } = await book(nextHour());
        for (const step of pathTo[from]) await setStatus(id, step);
        const attempt = setStatus(id, to);
        if (BOOKING_MOVES[from].includes(to)) await attempt;
        else await expect(attempt, `${from} → ${to}`).rejects.toMatchObject({ code: "YK003" });
      }
    }
  });

  it("allows exactly the payment changes listed in PAYMENT_MOVES", async () => {
    expect(PAYMENT_MOVES).toEqual({ NOT_PAID: ["PAID"], PAID: ["REFUNDED"], REFUNDED: [] });
    const { id } = await book(nextHour());
    const pay = (payment_status: "NOT_PAID" | "PAID" | "REFUNDED") =>
      t.db.updateTable("booking").set({ payment_status }).where("id", "=", id).execute();
    await expect(pay("REFUNDED")).rejects.toMatchObject({ code: "YK003" });
    await expect(pay("PAID")).rejects.toThrow(/booking_hold_not_paid/);
    await t.db
      .updateTable("booking")
      .set({ status: "CONFIRMED", payment_status: "PAID" })
      .where("id", "=", id)
      .execute();
    await expect(pay("NOT_PAID")).rejects.toMatchObject({ code: "YK003" });
    await expect(pay("REFUNDED")).rejects.toThrow(/booking_refund_needs_cancel/);
    await t.db
      .updateTable("booking")
      .set({ status: "CANCELLED", payment_status: "REFUNDED" })
      .where("id", "=", id)
      .execute();
    await expect(pay("PAID")).rejects.toMatchObject({ code: "YK003" });
  });

  it("starts online bookings as unpaid holds; the desk can confirm straight away", async () => {
    await expect(book({ ...nextHour(), status: "CONFIRMED" })).rejects.toMatchObject({
      code: "YK003",
    });
    await expect(book({ ...nextHour(), payment_status: "PAID" })).rejects.toMatchObject({
      code: "YK003",
    });
    const walkIn = await book({
      ...nextHour(),
      source: "WALK_IN",
      status: "CONFIRMED",
      payment_status: "PAID",
      hold_expires_at: null,
      player_id: null,
      player_name: "Walk-in, Team Blue",
      player_phone: "+919811100066",
    });
    expect(walkIn).toMatchObject({ status: "CONFIRMED", payment_status: "PAID" });
  });

  it("checks the booking's own fields", async () => {
    await expect(book({ ...nextHour(), hold_expires_at: null })).rejects.toThrow(
      /booking_hold_expires/,
    );
    await expect(book({ ...nextHour(), minutes: 90 })).rejects.toThrow(/booking_minutes_match/);
    await expect(book({ ...nextHour(), price_paise: 120_050 })).rejects.toThrow(
      /booking_price_whole_rupees/,
    );
    await expect(book({ ...nextHour(), player_id: null })).rejects.toThrow(/booking_player_named/);
    await expect(book({ ...nextHour(), player_phone: "9811100066" })).rejects.toThrow(
      /booking_player_phone_e164/,
    );
  });

  it("never moves a booking to another court or time", async () => {
    const { id } = await book(nextHour());
    const later = nextHour();
    await expect(
      t.db
        .updateTable("booking")
        .set({ during: range(later.from, later.to) })
        .where("id", "=", id)
        .execute(),
    ).rejects.toMatchObject({ code: "YK003" });
  });

  it("numbers bookings and accepts each idempotency key once per person", async () => {
    const first = await book({ ...nextHour(), created_by: playerId, idempotency_key: "key-0001" });
    const second = await book(nextHour());
    expect(BigInt(second.number)).toBeGreaterThan(BigInt(first.number));
    await expect(
      book({ ...nextHour(), created_by: playerId, idempotency_key: "key-0001" }),
    ).rejects.toThrow(/booking_idempotency_unique/);
  });
});

describe("blocks and bookings refuse each other", () => {
  it("refuses a booking in blocked time", async () => {
    await block("2026-12-21T00:30Z", "2026-12-21T04:30Z");
    await expect(
      book({ from: "2026-12-21T04:00Z", to: "2026-12-21T05:00Z" }),
    ).rejects.toMatchObject({ code: "YK001" });
    await book({ from: "2026-12-21T04:30Z", to: "2026-12-21T05:30Z" });
  });

  it("refuses a block over a live booking, but not over a cancelled one or a stale hold", async () => {
    await book({ from: "2026-12-22T12:30Z", to: "2026-12-22T13:30Z" });
    await expect(block("2026-12-22T13:00Z", "2026-12-22T15:00Z")).rejects.toMatchObject({
      code: "YK002",
    });

    const cancelled = await book({ from: "2026-12-23T12:30Z", to: "2026-12-23T13:30Z" });
    await setStatus(cancelled.id, "CANCELLED");
    await book({
      from: "2026-12-23T14:30Z",
      to: "2026-12-23T15:30Z",
      hold_expires_at: new Date(Date.now() - 60_000),
    });
    await block("2026-12-23T12:00Z", "2026-12-23T16:00Z");
  });

  it("lets exactly one of many parallel bookings take a slot", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        book({ from: "2027-02-01T12:30Z", to: "2027-02-01T13:30Z" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("lets only one of a racing block and booking in", async () => {
    for (let i = 0; i < 10; i++) {
      const from = new Date(Date.UTC(2027, 2, 1, i)).toISOString();
      const to = new Date(Date.UTC(2027, 2, 1, i + 1)).toISOString();
      const results = await Promise.allSettled([book({ from, to }), block(from, to)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    }
  });
});
