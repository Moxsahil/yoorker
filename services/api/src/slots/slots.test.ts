import {
  courtGridSchema,
  courtSchema,
  courtSlotsSchema,
  organisationSchema,
  venueSchema,
} from "@yoorker/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";
import { SlotsService } from "./slots.service";

let t: TestApp;
let owner: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };
let outsider: { userId: string; cookie: string };
let courtId: string;

// The test clock starts on Monday 14 Dec 2026 at 06:00 IST.
const MONDAY = "2026-12-14";

const slots = (query: string) => t.http().get(`/courts/${courtId}/slots?${query}`);
const grid = (query: string, cookie = owner.cookie) =>
  t.http().get(`/courts/${courtId}/grid?${query}`).set("Cookie", cookie);

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.signIn("9811100051");
  staff = await t.signIn("9811100052");
  outsider = await t.signIn("9811100053");
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
      slug: "green-arena-slots",
      name: "Green Arena",
      address: "Sector 57, Gurugram, Haryana",
      location: { lat: 28.4211, lng: 77.0878 },
      city: { name: "Gurugram", state: "Haryana" },
    })
    .expect(201);
  const venueId = venueSchema.parse(venue.body).id;
  const court = await t
    .http()
    .post(`/venues/${venueId}/courts`)
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
      durations: [{ minutes: 60 }, { minutes: 90 }],
      days: [
        ...[1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          windows: [{ opens: "06:00", closes: "23:00" }],
        })),
        { weekday: 6, windows: [{ opens: "06:00", closes: "02:00" }] },
      ],
    })
    .expect(200);
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
  await t
    .http()
    .post(`/venues/${venueId}/blocks`)
    .set("Cookie", owner.cookie)
    .send({
      from: `${MONDAY}T18:00`,
      to: `${MONDAY}T20:00`,
      reason: "MAINTENANCE",
      courtIds: [courtId],
    })
    .expect(201);
});

afterAll(async () => {
  await t?.close();
});

beforeEach(() => {
  t.clock.set("2026-12-14T00:30:00Z"); // Monday 06:00 IST
});

describe("player slots (TURF-204)", () => {
  it("shows a day's slots with prices to anyone, without signing in", async () => {
    const res = await slots(`date=${MONDAY}&minutes=60`).expect(200);
    const day = courtSlotsSchema.parse(res.body);
    expect(day).toMatchObject({ courtId, date: MONDAY, minutes: 60, timezone: "Asia/Kolkata" });
    expect(day.slots).toHaveLength(33);
    const at = Object.fromEntries(day.slots.map((s) => [s.start, s]));
    expect(at["06:00"]).toMatchObject({ status: "FREE", end: "07:00", pricePaise: 120_000 });
    expect(at["18:00"]).toMatchObject({ status: "BLOCKED", pricePaise: 160_000 });
    expect(at["20:00"]).toMatchObject({ status: "FREE", ruleName: "Evening" });
  });

  it("hides slots that have already started", async () => {
    t.clock.set("2026-12-14T04:45:00Z"); // 10:15 IST
    const res = await slots(`date=${MONDAY}&minutes=60`).expect(200);
    expect(res.body.slots[0].start).toBe("10:30");
  });

  it("runs Saturday night past midnight", async () => {
    const res = await slots("date=2026-12-19&minutes=90").expect(200);
    expect(res.body.slots.at(-1)).toMatchObject({ start: "00:30", end: "02:00" });
  });

  it("allows dates from today up to 30 days ahead only", async () => {
    await slots("date=2027-01-13&minutes=60").expect(200);
    const late = await slots("date=2027-01-14&minutes=60").expect(400);
    expect(late.body.message).toBe("Pick a date from today up to 30 days ahead");
    await slots("date=2026-12-13&minutes=60").expect(400);
  });

  it("only offers the court's booking lengths", async () => {
    const res = await slots(`date=${MONDAY}&minutes=120`).expect(400);
    expect(res.body.message).toBe("2 h isn't a booking length of this court");
    await slots(`date=${MONDAY}`).expect(400);
  });

  it("hides inactive and unknown courts", async () => {
    await t
      .http()
      .patch(`/courts/${courtId}`)
      .set("Cookie", owner.cookie)
      .send({ isActive: false })
      .expect(200);
    await slots(`date=${MONDAY}&minutes=60`).expect(404);
    await t
      .http()
      .patch(`/courts/${courtId}`)
      .set("Cookie", owner.cookie)
      .send({ isActive: true })
      .expect(200);
    await t
      .http()
      .get(`/courts/00000000-0000-4000-8000-000000000000/slots?date=${MONDAY}&minutes=60`)
      .expect(404);
  });
});

describe("owner week grid (TURF-204)", () => {
  it("shows seven days of cells with blocks, closed days and the past", async () => {
    t.clock.set("2026-12-14T04:45:00Z"); // Monday 10:15 IST
    const res = await grid(`from=${MONDAY}`, staff.cookie).expect(200);
    const week = courtGridSchema.parse(res.body);
    expect(week.startStepMinutes).toBe(30);
    expect(week.days.map((d) => d.date)).toEqual([
      "2026-12-14",
      "2026-12-15",
      "2026-12-16",
      "2026-12-17",
      "2026-12-18",
      "2026-12-19",
      "2026-12-20",
    ]);
    const monday = Object.fromEntries(week.days[0]!.cells.map((c) => [c.start, c]));
    expect(monday["10:00"]!.status).toBe("PAST");
    expect(monday["10:30"]!.status).toBe("FREE");
    expect(monday["18:00"]).toMatchObject({ status: "BLOCKED", blockReason: "MAINTENANCE" });
    expect(monday["20:00"]!.status).toBe("FREE");
    expect(week.days[5]!.cells.at(-1)!.start).toBe("01:30"); // Saturday night
    expect(week.days[6]!.cells).toEqual([]); // closed on Sunday
  });

  it("is for members only and limits the range", async () => {
    await t.http().get(`/courts/${courtId}/grid?from=${MONDAY}`).expect(401);
    await grid(`from=${MONDAY}`, outsider.cookie).expect(404);
    await grid(`from=${MONDAY}&days=15`).expect(400);
    expect((await grid(`from=${MONDAY}&days=1`).expect(200)).body.days).toHaveLength(1);
  });
});

describe("next free slots (TURF-204)", () => {
  it("finds the next bookable slots for discovery", async () => {
    t.clock.set("2026-12-14T16:00:00Z"); // Monday 21:30 IST
    const next = await t.app.get(SlotsService).nextFreeSlots(courtId, 60);
    expect(next.map((s) => s.startsAt)).toEqual([
      "2026-12-14T16:00:00.000Z", // Mon 21:30
      "2026-12-14T16:30:00.000Z", // Mon 22:00
      "2026-12-15T00:30:00.000Z", // Tue 06:00
    ]);
  });
});
