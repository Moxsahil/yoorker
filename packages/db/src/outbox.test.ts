import { sql } from "kysely";
import { afterAll, beforeAll, expect, it } from "vitest";
import { point } from "./geo";
import { startTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let courtId: string;
let venueId: string;

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
      slug: "green-arena-outbox",
      name: "Green Arena",
      address: "Sector 57, Gurugram, Haryana",
      location: point(77.0878, 28.4211),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  venueId = venue.id;
  const court = await t.db
    .insertInto("court")
    .values({
      venue_id: venueId,
      name: "Turf 1",
      sports: ["FOOTBALL"],
      surface: "ARTIFICIAL_TURF",
      capacity: 14,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  courtId = court.id;
});

afterAll(async () => {
  await t?.stop();
});

const range = (from: string, to: string) =>
  sql<string>`tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')`;

async function eventsSince(id: string) {
  const rows = await t.db
    .selectFrom("outbox")
    .select(["id", "event", "payload"])
    .where("id", ">", id)
    .orderBy("id")
    .execute();
  return rows.map((r) => ({
    event: r.event,
    ...(r.payload as { courtId: string; venueId: string; from: string; to: string }),
  }));
}

async function lastId() {
  const row = await t.db
    .selectFrom("outbox")
    .select(sql<string>`coalesce(max(id), 0)::text`.as("id"))
    .executeTakeFirstOrThrow();
  return row.id;
}

it("records slot_changed when a booking is made or its status changes (TURF-307)", async () => {
  const before = await lastId();
  const booking = await t.db
    .insertInto("booking")
    .values({
      court_id: courtId,
      during: range("2027-01-04T12:30Z", "2027-01-04T13:30Z"),
      minutes: 60,
      sport: "FOOTBALL",
      source: "WALK_IN",
      status: "CONFIRMED",
      player_name: "Walk-in",
      price_paise: 120_000,
      price_source: "HOURLY",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await t.db
    .updateTable("booking")
    .set({ payment_status: "PAID" })
    .where("id", "=", booking.id)
    .execute();
  await t.db
    .updateTable("booking")
    .set({ status: "CANCELLED" })
    .where("id", "=", booking.id)
    .execute();

  const events = await eventsSince(before);
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ event: "slot_changed", courtId, venueId });
  expect(new Date(events[0]!.from).toISOString()).toBe("2027-01-04T12:30:00.000Z");
  expect(new Date(events[0]!.to).toISOString()).toBe("2027-01-04T13:30:00.000Z");
});

it("records slot_changed when a block is added or removed", async () => {
  const before = await lastId();
  const block = await t.db
    .insertInto("blackout")
    .values({
      court_id: courtId,
      during: range("2027-01-05T00:30Z", "2027-01-05T04:30Z"),
      reason: "MAINTENANCE",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await t.db.deleteFrom("blackout").where("id", "=", block.id).execute();
  const events = await eventsSince(before);
  expect(events.map((e) => e.event)).toEqual(["slot_changed", "slot_changed"]);
});

it("writes nothing when the change is rolled back", async () => {
  const before = await lastId();
  await t.db
    .transaction()
    .execute(async (trx) => {
      await trx
        .insertInto("blackout")
        .values({
          court_id: courtId,
          during: range("2027-01-06T00:30Z", "2027-01-06T01:30Z"),
          reason: "OTHER",
        })
        .execute();
      throw new Error("roll back");
    })
    .catch(() => undefined);
  expect(await eventsSince(before)).toEqual([]);
});
