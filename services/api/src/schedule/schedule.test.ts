import {
  auditEntrySchema,
  courtScheduleSchema,
  courtSchema,
  organisationSchema,
  venueSchema,
  type CourtSchedule,
} from "@yoorker/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";

let t: TestApp;
let owner: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };
let outsider: { userId: string; cookie: string };
let organisationId: string;
let turfId: string;
let groundId: string;

const footballWeek = {
  startStepMinutes: 30,
  durations: [
    { minutes: 60, label: null, sport: null, pricePaise: null },
    { minutes: 90, label: null, sport: null, pricePaise: null },
  ],
  days: [
    ...[1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      windows: [{ opens: "06:00", closes: "23:00" }],
    })),
    { weekday: 6, windows: [{ opens: "06:00", closes: "02:00" }] },
  ],
};

async function createCourt(venueId: string, name: string, sports: string[]): Promise<string> {
  const res = await t
    .http()
    .post(`/venues/${venueId}/courts`)
    .set("Cookie", owner.cookie)
    .send({ name, sports, surface: "ARTIFICIAL_TURF", capacity: 14 })
    .expect(201);
  return courtSchema.parse(res.body).id;
}

const put = (courtId: string, body: object, cookie = owner.cookie) =>
  t.http().put(`/courts/${courtId}/schedule`).set("Cookie", cookie).send(body);

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.signIn("9811100021");
  staff = await t.signIn("9811100022");
  outsider = await t.signIn("9811100023");
  const org = await t
    .http()
    .post("/organisations")
    .set("Cookie", owner.cookie)
    .send({ name: "Green Arena" })
    .expect(201);
  organisationId = organisationSchema.parse(org.body).id;
  await t.db
    .insertInto("membership")
    .values({ organisation_id: organisationId, user_id: staff.userId, role: "STAFF" })
    .execute();
  const venue = await t
    .http()
    .post(`/organisations/${organisationId}/venues`)
    .set("Cookie", owner.cookie)
    .send({
      slug: "green-arena",
      name: "Green Arena",
      address: "Sector 57, Gurugram, Haryana",
      location: { lat: 28.4211, lng: 77.0878 },
      city: { name: "Gurugram", state: "Haryana" },
    })
    .expect(201);
  const venueId = venueSchema.parse(venue.body).id;
  turfId = await createCourt(venueId, "Turf 1", ["FOOTBALL", "CRICKET"]);
  groundId = await createCourt(venueId, "Cricket ground", ["CRICKET"]);
});

afterAll(async () => {
  await t?.close();
});

describe("court schedules (TURF-206)", () => {
  it("starts closed, with a 30-minute step and no booking lengths", async () => {
    const res = await t
      .http()
      .get(`/courts/${turfId}/schedule`)
      .set("Cookie", staff.cookie)
      .expect(200);
    const schedule = courtScheduleSchema.parse(res.body);
    expect(schedule).toMatchObject({
      timezone: "Asia/Kolkata",
      startStepMinutes: 30,
      durations: [],
      alwaysOpen: false,
    });
    expect(schedule.days.every((d) => d.windows.length === 0)).toBe(true);
  });

  it("saves a week with a late Saturday and returns all seven days", async () => {
    const res = await put(turfId, footballWeek).expect(200);
    const schedule = courtScheduleSchema.parse(res.body);
    expect(schedule.durations.map((d) => d.minutes)).toEqual([60, 90]);
    expect(schedule.days.map((d) => d.windows)).toEqual([
      ...Array(5).fill([{ opens: "06:00", closes: "23:00" }]),
      [{ opens: "06:00", closes: "02:00" }],
      [],
    ]);

    const again = await t
      .http()
      .get(`/courts/${turfId}/schedule`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(again.body).toEqual(res.body);
  });

  it("offers a T20 package only for cricket on a cricket ground open 24/7", async () => {
    const res = await put(groundId, {
      startStepMinutes: 30,
      alwaysOpen: true,
      durations: [
        { minutes: 120, label: "10-over game" },
        { minutes: 210, label: "T20 match", sport: "CRICKET", pricePaise: 1_500_000 },
        { minutes: 480, label: "Full day (corporate)" },
      ],
    }).expect(200);
    const schedule: CourtSchedule = courtScheduleSchema.parse(res.body);
    expect(schedule.alwaysOpen).toBe(true);
    expect(schedule.days.every((d) => d.windows[0]!.opens === "00:00")).toBe(true);
    expect(schedule.durations[1]).toEqual({
      minutes: 210,
      label: "T20 match",
      sport: "CRICKET",
      pricePaise: 1_500_000,
    });
  });

  it("explains every problem in one 400", async () => {
    const res = await put(turfId, {
      startStepMinutes: 60,
      durations: [{ minutes: 90 }, { minutes: 60, sport: "BADMINTON" }],
      days: [
        {
          weekday: 1,
          windows: [
            { opens: "06:00", closes: "12:00" },
            { opens: "11:00", closes: "14:00" },
          ],
        },
      ],
    }).expect(400);
    expect(res.body.issues).toEqual([
      { path: "days.0.windows.1", message: "Opening hours overlap another window" },
      {
        path: "durations.0.minutes",
        message: "1 h 30 m must be a whole number of 60-minute steps",
      },
      { path: "durations.1.sport", message: "This court doesn't offer BADMINTON" },
    ]);
  });

  it("rejects malformed schedules", async () => {
    for (const body of [
      { ...footballWeek, startStepMinutes: 45 },
      { ...footballWeek, durations: [] },
      { ...footballWeek, alwaysOpen: true },
      { startStepMinutes: 30, durations: footballWeek.durations },
      { ...footballWeek, days: [{ weekday: 8, windows: [] }] },
      { ...footballWeek, days: [{ weekday: 1, windows: [{ opens: "6am", closes: "23:00" }] }] },
      { ...footballWeek, days: [{ weekday: 1, windows: [{ opens: "06:10", closes: "23:00" }] }] },
      { ...footballWeek, durations: [{ minutes: 780 }] },
    ]) {
      await put(turfId, body).expect(400);
    }
  });

  it("keeps the old schedule when an update is rejected", async () => {
    const res = await t
      .http()
      .get(`/courts/${turfId}/schedule`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(res.body.durations.map((d: { minutes: number }) => d.minutes)).toEqual([60, 90]);
  });

  it("records the change in the audit log with before and after", async () => {
    const audit = await t
      .http()
      .get(`/organisations/${organisationId}/audit-log`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const entries = auditEntrySchema
      .array()
      .parse(audit.body)
      .filter((e) => e.action === "court.schedule.update" && e.entityId === turfId);
    expect(entries).toHaveLength(1);
    expect((entries[0]!.before as CourtSchedule).durations).toEqual([]);
    expect((entries[0]!.after as CourtSchedule).durations).toHaveLength(2);
  });

  it("lets staff read but not change schedules, and hides courts from outsiders", async () => {
    await put(turfId, footballWeek, staff.cookie).expect(403);
    await t.http().get(`/courts/${turfId}/schedule`).set("Cookie", outsider.cookie).expect(404);
    await put(turfId, footballWeek, outsider.cookie).expect(404);
    await t
      .http()
      .get("/courts/00000000-0000-4000-8000-000000000000/schedule")
      .set("Cookie", owner.cookie)
      .expect(404);
    await t.http().get(`/courts/${turfId}/schedule`).expect(401);
  });

  it("drops a sport's booking lengths when the court stops offering that sport", async () => {
    await put(turfId, {
      ...footballWeek,
      durations: [{ minutes: 60 }, { minutes: 210, label: "T20 match", sport: "CRICKET" }],
    }).expect(200);
    await t
      .http()
      .patch(`/courts/${turfId}`)
      .set("Cookie", owner.cookie)
      .send({ sports: ["FOOTBALL"] })
      .expect(200);
    const res = await t
      .http()
      .get(`/courts/${turfId}/schedule`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(res.body.durations).toEqual([
      { minutes: 60, label: null, sport: null, pricePaise: null },
    ]);
  });
});
