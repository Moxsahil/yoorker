import {
  bookingSchema,
  courtGridSchema,
  courtSchema,
  courtSlotsSchema,
  organisationSchema,
  venueSchema,
} from "@yoorker/contracts";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JOBS } from "../jobs/jobs.module";
import { createTestApp, type TestApp } from "../testing/test-app";
import { HoldExpiry, SWEEP_HOLDS } from "./hold-expiry";

let t: TestApp;
let owner: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };
let player: { userId: string; cookie: string };
let rival: { userId: string; cookie: string };
let venueId: string;
let courtId: string;
let mixedCourtId: string;
let keys = 0;

// The test clock starts on Monday 14 Dec 2026 at 06:00 IST.
const MONDAY = "2026-12-14";
const TUESDAY = "2026-12-15";
const WEDNESDAY = "2026-12-16";
const SIX_MINUTES_LATER = "2026-12-14T00:36:00Z";

const key = () => `test-key-${++keys}`;

const hold = (body: Record<string, unknown>, cookie = player.cookie, court = courtId) =>
  t
    .http()
    .post(`/courts/${court}/bookings`)
    .set("Cookie", cookie)
    .send({ minutes: 60, idempotencyKey: key(), ...body });

async function createCourt(name: string, sports: string[]): Promise<string> {
  const res = await t
    .http()
    .post(`/venues/${venueId}/courts`)
    .set("Cookie", owner.cookie)
    .send({ name, sports, surface: "ARTIFICIAL_TURF", capacity: 14 })
    .expect(201);
  const id = courtSchema.parse(res.body).id;
  await t
    .http()
    .put(`/courts/${id}/schedule`)
    .set("Cookie", owner.cookie)
    .send({
      startStepMinutes: 30,
      durations: [{ minutes: 60 }, { minutes: 90 }],
      days: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        windows: [{ opens: "06:00", closes: "23:00" }],
      })),
    })
    .expect(200);
  return id;
}

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.signIn("9811100061");
  staff = await t.signIn("9811100062");
  player = await t.signInWithGoogle({ subject: "player-rohan" });
  rival = await t.signInWithGoogle({ subject: "player-kabir" });
  const org = await t
    .http()
    .post("/organisations")
    .set("Cookie", owner.cookie)
    .send({ name: "Green Arena" })
    .expect(201);
  const organisationId = organisationSchema.parse(org.body).id;
  await t.db
    .insertInto("membership")
    .values({ organisation_id: organisationId, user_id: staff.userId, role: "STAFF" })
    .execute();
  const venue = await t
    .http()
    .post(`/organisations/${organisationId}/venues`)
    .set("Cookie", owner.cookie)
    .send({
      slug: "green-arena-bookings",
      name: "Green Arena",
      address: "Sector 57, Gurugram, Haryana",
      location: { lat: 28.4211, lng: 77.0878 },
      city: { name: "Gurugram", state: "Haryana" },
    })
    .expect(201);
  venueId = venueSchema.parse(venue.body).id;
  courtId = await createCourt("Turf 1", ["FOOTBALL"]);
  mixedCourtId = await createCourt("Turf 2", ["FOOTBALL", "CRICKET"]);
  await t
    .http()
    .put(`/courts/${courtId}/prices`)
    .set("Cookie", owner.cookie)
    .send({
      basePricePerHourPaise: 120_000,
      rules: [
        {
          name: "Evening",
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          from: "18:00",
          to: "00:00",
          unit: "PER_HOUR",
          pricePaise: 160_000,
        },
      ],
    })
    .expect(200);
});

afterAll(async () => {
  await t?.close();
});

beforeEach(() => {
  t.clock.set("2026-12-14T00:30:00Z"); // Monday 06:00 IST
});

describe("holding a slot (TURF-302)", () => {
  it("holds a slot for 5 minutes at today's price", async () => {
    const res = await hold({ date: MONDAY, start: "19:00" }).expect(201);
    const booking = bookingSchema.parse(res.body);
    expect(booking).toMatchObject({
      courtId,
      venueId,
      date: MONDAY,
      start: "19:00",
      end: "20:00",
      startsAt: "2026-12-14T13:30:00.000Z",
      minutes: 60,
      sport: "FOOTBALL",
      status: "HELD",
      paymentStatus: "NOT_PAID",
      source: "ONLINE",
      holdExpiresAt: "2026-12-14T00:35:00.000Z",
      pricePaise: 160_000,
      priceSource: "HOURLY",
      priceRuleName: "Evening",
    });
    expect(booking.reference).toMatch(/^BK-\d{5}$/);
  });

  it("returns the same hold when a request is retried with its key", async () => {
    const body = { date: MONDAY, start: "07:00", idempotencyKey: "retry-key-0001" };
    const first = bookingSchema.parse((await hold(body).expect(201)).body);
    const again = bookingSchema.parse((await hold(body).expect(200)).body);
    expect(again.id).toBe(first.id);
    await hold({ ...body, start: "08:00" }).expect(409);
  });

  it("refuses a slot someone else is holding: just taken", async () => {
    await hold({ date: MONDAY, start: "10:00" }).expect(201);
    const res = await hold({ date: MONDAY, start: "10:30" }, rival.cookie).expect(409);
    expect(res.body.message).toBe("Just taken. Pick another time.");
  });

  it("lets exactly one of many players racing for a slot get it", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => hold({ date: TUESDAY, start: "18:00" }, rival.cookie)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
  });

  it("refuses blocked time", async () => {
    await t
      .http()
      .post(`/venues/${venueId}/blocks`)
      .set("Cookie", owner.cookie)
      .send({
        from: `${TUESDAY}T06:00`,
        to: `${TUESDAY}T09:00`,
        reason: "MAINTENANCE",
        courtIds: [courtId],
      })
      .expect(201);
    const res = await hold({ date: TUESDAY, start: "08:30" }).expect(409);
    expect(res.body.message).toBe("That time is blocked. Pick another time.");
  });

  it("only offers real slots: dates, start times, lengths, sports and prices", async () => {
    const message = async (body: Record<string, unknown>, court = courtId) =>
      (await hold(body, player.cookie, court).expect(400)).body.message;
    expect(await message({ date: "2026-12-13", start: "10:00" })).toMatch(/from today/);
    expect(await message({ date: "2027-01-20", start: "10:00" })).toMatch(/30 days ahead/);
    expect(await message({ date: MONDAY, start: "06:00" })).toBe("That time has already started");
    expect(await message({ date: MONDAY, start: "10:15" })).toBe(
      "That isn't a start time of this court",
    );
    expect(await message({ date: MONDAY, start: "22:30" })).toBe(
      "That isn't a start time of this court",
    );
    expect(await message({ date: MONDAY, start: "11:00", minutes: 120 })).toMatch(
      /isn't a booking length/,
    );
    expect(await message({ date: MONDAY, start: "11:00", sport: "CRICKET" })).toMatch(
      /doesn't offer CRICKET/,
    );
    expect(await message({ date: MONDAY, start: "11:00" }, mixedCourtId)).toBe(
      "Pick a sport for this court",
    );
    expect(await message({ date: MONDAY, start: "11:00", sport: "CRICKET" }, mixedCourtId)).toBe(
      "This time has no price, so it can't be booked",
    );
    await hold({ date: MONDAY, start: "11:00", idempotencyKey: "bad key!" }).expect(400);
  });

  it("needs a signed-in player and an active court", async () => {
    await t
      .http()
      .post(`/courts/${courtId}/bookings`)
      .send({ date: MONDAY, start: "12:00", minutes: 60, idempotencyKey: key() })
      .expect(401);
    await t
      .http()
      .patch(`/courts/${mixedCourtId}`)
      .set("Cookie", owner.cookie)
      .send({ isActive: false })
      .expect(200);
    await hold(
      { date: MONDAY, start: "12:00", sport: "FOOTBALL" },
      player.cookie,
      mixedCourtId,
    ).expect(404);
  });
});

describe("what players and owners see", () => {
  it("shows a hold as being booked in the player's slots and the owner's grid", async () => {
    await hold({ date: MONDAY, start: "14:00" }).expect(201);
    const slots = courtSlotsSchema.parse(
      (await t.http().get(`/courts/${courtId}/slots?date=${MONDAY}&minutes=60`).expect(200)).body,
    );
    const at = Object.fromEntries(slots.slots.map((s) => [s.start, s.status]));
    expect(at["13:30"]).toBe("HELD");
    expect(at["14:00"]).toBe("HELD");
    expect(at["15:00"]).toBe("FREE");

    const grid = courtGridSchema.parse(
      (
        await t
          .http()
          .get(`/courts/${courtId}/grid?from=${MONDAY}&days=1`)
          .set("Cookie", owner.cookie)
          .expect(200)
      ).body,
    );
    const cells = Object.fromEntries(grid.days[0]!.cells.map((c) => [c.start, c.status]));
    expect(cells["14:00"]).toBe("HELD");
    expect(cells["14:30"]).toBe("HELD");
  });

  it("frees the slot in the views once the 5 minutes are up", async () => {
    await hold({ date: MONDAY, start: "16:00" }).expect(201);
    t.clock.set("2026-12-14T00:36:00Z");
    const slots = courtSlotsSchema.parse(
      (await t.http().get(`/courts/${courtId}/slots?date=${MONDAY}&minutes=60`).expect(200)).body,
    );
    expect(slots.slots.find((s) => s.start === "16:00")?.status).toBe("FREE");
  });

  it("shows a booking to its player and the venue's team, and no one else", async () => {
    const { id } = bookingSchema.parse(
      (await hold({ date: MONDAY, start: "20:00" }).expect(201)).body,
    );
    for (const who of [player, owner, staff]) {
      await t.http().get(`/bookings/${id}`).set("Cookie", who.cookie).expect(200);
    }
    await t.http().get(`/bookings/${id}`).set("Cookie", rival.cookie).expect(404);
    await t.http().get(`/bookings/${id}`).expect(401);
  });

  it("keeps the price a booking was made at", async () => {
    const { id } = bookingSchema.parse(
      (await hold({ date: MONDAY, start: "21:00" }).expect(201)).body,
    );
    await t
      .http()
      .put(`/courts/${courtId}/prices`)
      .set("Cookie", owner.cookie)
      .send({ basePricePerHourPaise: 200_000, rules: [] })
      .expect(200);
    const res = await t.http().get(`/bookings/${id}`).set("Cookie", player.cookie).expect(200);
    expect(bookingSchema.parse(res.body)).toMatchObject({
      pricePaise: 160_000,
      priceRuleName: "Evening",
    });
  });
});

describe("cancelling a hold", () => {
  it("lets the player let go of their hold, which frees the slot at once", async () => {
    const { id } = bookingSchema.parse(
      (await hold({ date: TUESDAY, start: "12:00" }).expect(201)).body,
    );
    await t.http().post(`/bookings/${id}/cancel`).set("Cookie", rival.cookie).expect(404);
    const res = await t
      .http()
      .post(`/bookings/${id}/cancel`)
      .set("Cookie", player.cookie)
      .expect(200);
    expect(bookingSchema.parse(res.body).status).toBe("CANCELLED");
    await t.http().post(`/bookings/${id}/cancel`).set("Cookie", player.cookie).expect(409);
    await hold({ date: TUESDAY, start: "12:00" }, rival.cookie).expect(201);
  });
});

describe("expiring holds (TURF-303)", () => {
  const status = async (id: string) =>
    bookingSchema.parse(
      (await t.http().get(`/bookings/${id}`).set("Cookie", player.cookie).expect(200)).body,
    ).status;

  it("lets the next player take a slot whose hold ran out, at once", async () => {
    const { id } = bookingSchema.parse(
      (await hold({ date: WEDNESDAY, start: "10:00" }).expect(201)).body,
    );
    t.clock.set(SIX_MINUTES_LATER);
    await hold({ date: WEDNESDAY, start: "10:00" }, rival.cookie).expect(201);
    expect(await status(id)).toBe("EXPIRED");
  });

  it("keeps a hold that is still inside its 5 minutes", async () => {
    await hold({ date: WEDNESDAY, start: "11:00" }).expect(201);
    t.clock.set("2026-12-14T00:34:00Z");
    await hold({ date: WEDNESDAY, start: "11:00" }, rival.cookie).expect(409);
  });

  it("sweeps every hold that ran out, and only those", async () => {
    const stale = bookingSchema.parse(
      (await hold({ date: WEDNESDAY, start: "13:00" }).expect(201)).body,
    );
    t.clock.set(SIX_MINUTES_LATER);
    const fresh = bookingSchema.parse(
      (await hold({ date: WEDNESDAY, start: "15:00" }).expect(201)).body,
    );
    expect(await t.app.get(HoldExpiry).sweep()).toBeGreaterThanOrEqual(1);
    expect(await status(stale.id)).toBe("EXPIRED");
    expect(await status(fresh.id)).toBe("HELD");
  });

  it("runs the sweep from the job queue, every minute", async () => {
    const boss = t.app.get<PgBoss>(JOBS);
    expect((await boss.getSchedules()).map((s) => [s.name, s.cron])).toContainEqual([
      SWEEP_HOLDS,
      "* * * * *",
    ]);
    const { id } = bookingSchema.parse(
      (await hold({ date: WEDNESDAY, start: "17:00" }).expect(201)).body,
    );
    t.clock.set(SIX_MINUTES_LATER);
    await boss.send(SWEEP_HOLDS);
    await expect.poll(() => status(id), { timeout: 15_000, interval: 250 }).toBe("EXPIRED");
  });
});
