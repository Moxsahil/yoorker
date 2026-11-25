import type { AddressInfo } from "node:net";
import {
  bookingSchema,
  courtSchema,
  organisationSchema,
  slotChangedSchema,
  venueSchema,
  type SlotChanged,
} from "@yoorker/contracts";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";
import { OutboxRelay } from "./outbox-relay";

let t: TestApp;
let base: string;
let owner: { cookie: string };
let player: { cookie: string };
let organisationId: string;
let northId: string;
let southId: string;
let courtId: string;
const streams: AbortController[] = [];

async function openStream(venueId: string) {
  const controller = new AbortController();
  streams.push(controller);
  const res = await fetch(`${base}/venues/${venueId}/events`, { signal: controller.signal });
  const events: SlotChanged[] = [];
  if (res.ok && res.body) {
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    void (async () => {
      let buffer = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += value;
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const type = /^event: (.*)$/m.exec(block)?.[1];
            const data = /^data: (.*)$/m.exec(block)?.[1];
            if (type === "slot_changed" && data)
              events.push(slotChangedSchema.parse(JSON.parse(data)));
          }
        }
      } catch {
        return;
      }
    })();
  }
  return { status: res.status, contentType: res.headers.get("content-type"), events };
}

async function createVenue(slug: string): Promise<string> {
  const res = await t
    .http()
    .post(`/organisations/${organisationId}/venues`)
    .set("Cookie", owner.cookie)
    .send({
      slug,
      name: "Green Arena",
      address: "Sector 57, Gurugram, Haryana",
      location: { lat: 28.4211, lng: 77.0878 },
      city: { name: "Gurugram", state: "Haryana" },
    })
    .expect(201);
  return venueSchema.parse(res.body).id;
}

beforeAll(async () => {
  t = await createTestApp();
  await t.app.listen(0, "127.0.0.1");
  base = `http://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}`;
  owner = await t.signIn("9811100081");
  player = await t.signInWithGoogle({ subject: "live-player" });
  const org = await t
    .http()
    .post("/organisations")
    .set("Cookie", owner.cookie)
    .send({ name: "Green Arena" })
    .expect(201);
  organisationId = organisationSchema.parse(org.body).id;
  northId = await createVenue("green-arena-live-north");
  southId = await createVenue("green-arena-live-south");
  const court = await t
    .http()
    .post(`/venues/${northId}/courts`)
    .set("Cookie", owner.cookie)
    .send({ name: "Turf 1", sports: ["FOOTBALL"], surface: "ARTIFICIAL_TURF", capacity: 14 })
    .expect(201);
  courtId = courtSchema.parse(court.body).id;
  await t
    .http()
    .put(`/courts/${courtId}/schedule`)
    .set("Cookie", owner.cookie)
    .send({
      startStepMinutes: 30,
      durations: [{ minutes: 60 }],
      days: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        windows: [{ opens: "06:00", closes: "23:00" }],
      })),
    })
    .expect(200);
  await t
    .http()
    .put(`/courts/${courtId}/prices`)
    .set("Cookie", owner.cookie)
    .send({ basePricePerHourPaise: 120_000, rules: [] })
    .expect(200);
});

afterAll(async () => {
  for (const stream of streams) stream.abort();
  await t?.close();
});

beforeEach(() => {
  t.clock.set("2026-12-14T00:30:00Z"); // Monday 06:00 IST
});

const hold = (start: string, key: string) =>
  t
    .http()
    .post(`/courts/${courtId}/bookings`)
    .set("Cookie", player.cookie)
    .send({ date: "2026-12-15", start, minutes: 60, idempotencyKey: key });

describe("live slot updates (TURF-307)", () => {
  it("tells an open venue page within moments when a slot is held", async () => {
    const stream = await openStream(northId);
    expect(stream.status).toBe(200);
    expect(stream.contentType).toContain("text/event-stream");
    const booking = bookingSchema.parse((await hold("18:00", "live-key-0001").expect(201)).body);
    await expect.poll(() => stream.events.length, { timeout: 5_000, interval: 100 }).toBe(1);
    expect(stream.events[0]).toMatchObject({ courtId, venueId: northId });
    expect(new Date(stream.events[0]!.from).toISOString()).toBe(booking.startsAt);
    expect(new Date(stream.events[0]!.to).toISOString()).toBe(booking.endsAt);
  });

  it("tells the page when a hold is let go and when the owner blocks time", async () => {
    const stream = await openStream(northId);
    const { id } = bookingSchema.parse((await hold("10:00", "live-key-0002").expect(201)).body);
    await t.http().post(`/bookings/${id}/cancel`).set("Cookie", player.cookie).expect(200);
    await t
      .http()
      .post(`/venues/${northId}/blocks`)
      .set("Cookie", owner.cookie)
      .send({
        from: "2026-12-15T07:00",
        to: "2026-12-15T08:00",
        reason: "MAINTENANCE",
        courtIds: [courtId],
      })
      .expect(201);
    await expect.poll(() => stream.events.length, { timeout: 5_000, interval: 100 }).toBe(3);
  });

  it("keeps each venue's events to its own page", async () => {
    const north = await openStream(northId);
    const south = await openStream(southId);
    await hold("20:00", "live-key-0003").expect(201);
    await expect.poll(() => north.events.length, { timeout: 5_000, interval: 100 }).toBe(1);
    expect(south.events).toEqual([]);
  });

  it("answers 404 for a venue that isn't taking bookings", async () => {
    expect((await openStream("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

describe("the outbox", () => {
  it("publishes every waiting event once and marks it", async () => {
    await t.db
      .insertInto("outbox")
      .values({
        event: "slot_changed",
        payload: JSON.stringify({ courtId, venueId: northId, from: "x", to: "y" }),
      })
      .execute();
    const relay = t.app.get(OutboxRelay);
    await relay.publish();
    const waiting = await t.db
      .selectFrom("outbox")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("published_at", "is", null)
      .executeTakeFirstOrThrow();
    expect(waiting.n).toBe(0);
  });

  it("deletes published events after 7 days", async () => {
    await t.db
      .insertInto("outbox")
      .values({ event: "slot_changed", payload: JSON.stringify({}) })
      .execute();
    await t.db
      .updateTable("outbox")
      .set({ published_at: sql<Date>`now() - interval '8 days'` })
      .where("id", "=", sql<string>`(SELECT max(id) FROM outbox)`)
      .execute();
    expect(await t.app.get(OutboxRelay).clean()).toBe(1);
  });
});
