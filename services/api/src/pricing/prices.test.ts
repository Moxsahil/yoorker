import {
  auditEntrySchema,
  courtPricesSchema,
  courtSchema,
  organisationSchema,
  priceQuoteSchema,
  venueSchema,
  type CourtPrices,
} from "@yoorker/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";

let t: TestApp;
let owner: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };
let outsider: { userId: string; cookie: string };
let organisationId: string;
let groundId: string;

const slot = (name: string, weekdays: number[], from: string, to: string, rupees: number) => ({
  name,
  weekdays,
  from,
  to,
  minutes: 210,
  unit: "PER_BOOKING",
  pricePaise: rupees * 100,
});

const rohtakPrices = {
  basePricePerHourPaise: null,
  rules: [
    slot("Evening", [1, 2, 3, 4, 5], "17:00", "21:00", 5000),
    slot("Weekend evening", [6, 7], "17:00", "21:00", 6000),
    slot("Night", [1, 2, 3, 4, 5], "21:00", "06:00", 6000),
    slot("Weekend night", [6, 7], "21:00", "06:00", 7000),
    {
      name: "Net practice",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      from: "06:00",
      to: "17:00",
      unit: "PER_HOUR",
      pricePaise: 150_000,
    },
    {
      name: "New Year's Eve",
      onDate: "2026-12-31",
      from: "17:00",
      to: "06:00",
      minutes: 210,
      unit: "PER_BOOKING",
      pricePaise: 900_000,
    },
  ],
};

const prices = (cookie = owner.cookie) =>
  t.http().get(`/courts/${groundId}/prices`).set("Cookie", cookie);
const putPrices = (body: object, cookie = owner.cookie) =>
  t.http().put(`/courts/${groundId}/prices`).set("Cookie", cookie).send(body);
const quoteFor = (query: string, cookie = owner.cookie) =>
  t.http().get(`/courts/${groundId}/quote?${query}`).set("Cookie", cookie);

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.signIn("9811100031");
  staff = await t.signIn("9811100032");
  outsider = await t.signIn("9811100033");
  const org = await t
    .http()
    .post("/organisations")
    .set("Cookie", owner.cookie)
    .send({ name: "Rohtak Cricket Club" })
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
      slug: "rohtak-cricket-ground",
      name: "Rohtak Cricket Ground",
      address: "Sector 3, Rohtak, Haryana",
      location: { lat: 28.8955, lng: 76.6066 },
      city: { name: "Rohtak", state: "Haryana" },
    })
    .expect(201);
  const court = await t
    .http()
    .post(`/venues/${venueSchema.parse(venue.body).id}/courts`)
    .set("Cookie", owner.cookie)
    .send({ name: "Main ground", sports: ["CRICKET"], surface: "NATURAL_GRASS", capacity: 30 })
    .expect(201);
  groundId = courtSchema.parse(court.body).id;
  await t
    .http()
    .put(`/courts/${groundId}/schedule`)
    .set("Cookie", owner.cookie)
    .send({
      startStepMinutes: 30,
      alwaysOpen: true,
      durations: [
        { minutes: 60, label: "Net practice" },
        { minutes: 210, label: "T20 match" },
      ],
    })
    .expect(200);
});

afterAll(async () => {
  await t?.close();
});

describe("court prices (TURF-201)", () => {
  it("starts with no prices", async () => {
    const res = await prices().expect(200);
    expect(courtPricesSchema.parse(res.body)).toEqual({
      courtId: groundId,
      basePricePerHourPaise: null,
      rules: [],
    });
  });

  it("saves the owner's own rules and returns them in order", async () => {
    const res = await putPrices(rohtakPrices).expect(200);
    const saved: CourtPrices = courtPricesSchema.parse(res.body);
    expect(saved.rules.map((r) => r.name)).toEqual(rohtakPrices.rules.map((r) => r.name));
    expect(saved.rules[2]).toEqual({
      name: "Night",
      weekdays: [1, 2, 3, 4, 5],
      onDate: null,
      from: "21:00",
      to: "06:00",
      minutes: 210,
      unit: "PER_BOOKING",
      pricePaise: 600_000,
      priority: 0,
    });
    expect(saved.rules[5]!.onDate).toBe("2026-12-31");
    expect((await prices().expect(200)).body).toEqual(res.body);
  });

  it("quotes slots, hourly practice and a special date", async () => {
    const cases: [string, number, string | null][] = [
      ["date=2026-12-22&start=17:30&minutes=210", 500_000, "Evening"],
      ["date=2026-12-19&start=17:30&minutes=210", 600_000, "Weekend evening"],
      ["date=2026-12-19&start=00:30&minutes=210", 600_000, "Night"], // still Friday night
      ["date=2026-12-20&start=21:00&minutes=210", 700_000, "Weekend night"],
      ["date=2026-12-31&start=21:00&minutes=210", 900_000, "New Year's Eve"],
      ["date=2026-12-22&start=10:00&minutes=60", 150_000, null],
    ];
    for (const [query, pricePaise, ruleName] of cases) {
      const res = await quoteFor(query, staff.cookie).expect(200);
      const quote = priceQuoteSchema.parse(res.body);
      expect(quote.pricePaise).toBe(pricePaise);
      expect(quote.ruleName).toBe(ruleName);
    }
  });

  it("says when a time has no price, and rejects bad quote requests", async () => {
    const res = await quoteFor("date=2026-12-22&start=18:00&minutes=60").expect(400);
    expect(res.body.message).toBe("No price is set for 2026-12-22 at 18:00");
    for (const query of [
      "date=2026-02-30&start=10:00&minutes=60",
      "date=2026-12-22&start=10:10&minutes=60",
      "date=2026-12-22&start=10:00&minutes=50",
      "date=2026-12-22&start=10:00",
    ]) {
      await quoteFor(query).expect(400);
    }
  });

  it("rejects rules that don't make sense", async () => {
    const bad = [
      { name: "No days", from: "06:00", to: "10:00", unit: "PER_HOUR", pricePaise: 100_000 },
      {
        name: "Both",
        weekdays: [1],
        onDate: "2026-12-31",
        from: "06:00",
        to: "10:00",
        unit: "PER_HOUR",
        pricePaise: 100_000,
      },
      {
        name: "Slot",
        weekdays: [1],
        from: "06:00",
        to: "10:00",
        unit: "PER_BOOKING",
        pricePaise: 100_000,
      },
      {
        name: "Paise",
        weekdays: [1],
        from: "06:00",
        to: "10:00",
        unit: "PER_HOUR",
        pricePaise: 100_050,
      },
      {
        name: "Twice",
        weekdays: [1, 1],
        from: "06:00",
        to: "10:00",
        unit: "PER_HOUR",
        pricePaise: 100,
      },
    ];
    for (const rule of bad) {
      await putPrices({ basePricePerHourPaise: null, rules: [rule] }).expect(400);
    }
    const res = await putPrices({
      basePricePerHourPaise: null,
      rules: [{ ...rohtakPrices.rules[0], minutes: 120 }],
    }).expect(400);
    expect(res.body.issues).toEqual([
      { path: "rules.0.minutes", message: "2 h isn't a booking length of this court" },
    ]);
    // Nothing changed.
    expect((await prices().expect(200)).body.rules).toHaveLength(6);
  });

  it("records price changes in the audit log", async () => {
    await putPrices({ ...rohtakPrices, basePricePerHourPaise: 100_000 }).expect(200);
    const audit = await t
      .http()
      .get(`/organisations/${organisationId}/audit-log`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const changes = auditEntrySchema
      .array()
      .parse(audit.body)
      .filter((e) => e.action === "court.prices.update");
    expect(changes).toHaveLength(2);
    expect((changes[0]!.before as CourtPrices).basePricePerHourPaise).toBeNull();
    expect((changes[0]!.after as CourtPrices).basePricePerHourPaise).toBe(100_000);
  });

  it("lets only owners and managers see and change prices; staff can quote", async () => {
    await prices(staff.cookie).expect(403);
    await putPrices(rohtakPrices, staff.cookie).expect(403);
    await prices(outsider.cookie).expect(404);
    await quoteFor("date=2026-12-22&start=17:30&minutes=210", outsider.cookie).expect(404);
    await t.http().get(`/courts/${groundId}/prices`).expect(401);
  });
});
