import {
  auditEntrySchema,
  blockSchema,
  courtSchema,
  organisationSchema,
  venueSchema,
  type Block,
} from "@yoorker/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localDateTimeToUtc, utcToLocal } from "../schedule/local-time";
import { createTestApp, type TestApp } from "../testing/test-app";

let t: TestApp;
let owner: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };
let outsider: { userId: string; cookie: string };
let organisationId: string;
let venueId: string;
let otherVenueId: string;
let turf1: string;
let turf2: string;
let otherCourt: string;

const maintenance = {
  from: "2026-12-19T06:00",
  to: "2026-12-19T10:00",
  reason: "MAINTENANCE",
  note: "Re-laying the turf",
};

const create = (body: object, cookie = owner.cookie, venue = venueId) =>
  t.http().post(`/venues/${venue}/blocks`).set("Cookie", cookie).send(body);
const list = (courtId: string, query = "from=2026-12-14&to=2026-12-21", cookie = owner.cookie) =>
  t.http().get(`/courts/${courtId}/blocks?${query}`).set("Cookie", cookie);
const remove = (blockId: string, cookie = owner.cookie) =>
  t.http().delete(`/blocks/${blockId}`).set("Cookie", cookie);

async function createVenue(slug: string): Promise<string> {
  const res = await t
    .http()
    .post(`/organisations/${organisationId}/venues`)
    .set("Cookie", owner.cookie)
    .send({
      slug,
      name: slug,
      address: "Sector 57, Gurugram, Haryana",
      location: { lat: 28.4211, lng: 77.0878 },
      city: { name: "Gurugram", state: "Haryana" },
    })
    .expect(201);
  return venueSchema.parse(res.body).id;
}

async function createCourt(venue: string, name: string): Promise<string> {
  const res = await t
    .http()
    .post(`/venues/${venue}/courts`)
    .set("Cookie", owner.cookie)
    .send({ name, sports: ["FOOTBALL"], surface: "ARTIFICIAL_TURF", capacity: 14 })
    .expect(201);
  return courtSchema.parse(res.body).id;
}

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.signIn("9811100041");
  staff = await t.signIn("9811100042");
  outsider = await t.signIn("9811100043");
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
  venueId = await createVenue("green-arena-blocks");
  otherVenueId = await createVenue("green-arena-two");
  turf1 = await createCourt(venueId, "Turf 1");
  turf2 = await createCourt(venueId, "Turf 2");
  otherCourt = await createCourt(otherVenueId, "Turf A");
});

afterAll(async () => {
  await t?.close();
});

describe("local times", () => {
  it("turns IST local times into UTC and back", () => {
    expect(localDateTimeToUtc("2026-12-19T06:00", "Asia/Kolkata").toISOString()).toBe(
      "2026-12-19T00:30:00.000Z",
    );
    expect(utcToLocal(new Date("2026-12-19T18:30:00Z"), "Asia/Kolkata")).toBe("2026-12-20T00:00");
  });
});

describe("blocks (TURF-203)", () => {
  let maintenanceBlock: Block;

  it("blocks one court for maintenance, stored in UTC and shown in local time", async () => {
    const res = await create({ ...maintenance, courtIds: [turf1] }).expect(201);
    const [block] = blockSchema.array().parse(res.body);
    expect(block).toMatchObject({
      courtId: turf1,
      startsAt: "2026-12-19T00:30:00.000Z",
      endsAt: "2026-12-19T04:30:00.000Z",
      from: "2026-12-19T06:00",
      to: "2026-12-19T10:00",
      reason: "MAINTENANCE",
      note: "Re-laying the turf",
      createdBy: owner.userId,
    });
    maintenanceBlock = block!;
  });

  it("lists a court's blocks for a date range", async () => {
    const res = await list(turf1, "from=2026-12-14&to=2026-12-21", staff.cookie).expect(200);
    expect(res.body.map((b: Block) => b.id)).toEqual([maintenanceBlock.id]);
    expect((await list(turf1, "from=2026-12-20&to=2026-12-27").expect(200)).body).toEqual([]);
    expect((await list(turf2).expect(200)).body).toEqual([]);
  });

  it("refuses an overlapping block and blocks nothing", async () => {
    const res = await create({
      from: "2026-12-19T09:00",
      to: "2026-12-19T12:00",
      reason: "PRIVATE_EVENT",
      allCourts: true,
    }).expect(409);
    expect(res.body.message).toBe("Already blocked at that time: Turf 1");
    expect((await list(turf2).expect(200)).body).toEqual([]);
  });

  it("allows a block that starts exactly when another ends", async () => {
    await create({
      from: "2026-12-19T10:00",
      to: "2026-12-19T12:00",
      reason: "PRIVATE_EVENT",
      note: "Birthday match",
      courtIds: [turf1],
    }).expect(201);
  });

  it("blocks every court of the venue for a holiday", async () => {
    const res = await create({
      from: "2026-12-25T00:00",
      to: "2026-12-26T00:00",
      reason: "HOLIDAY",
      note: "Christmas",
      allCourts: true,
    }).expect(201);
    const blocks = blockSchema.array().parse(res.body);
    expect(blocks.map((b) => b.courtId).sort()).toEqual([turf1, turf2].sort());
    expect(blocks[0]!.startsAt).toBe("2026-12-24T18:30:00.000Z");
    // A block covering a whole day shows up for that day.
    expect(
      (await list(turf2, "from=2026-12-25&to=2026-12-26").expect(200)).body.map(
        (b: Block) => b.reason,
      ),
    ).toEqual(["HOLIDAY"]);
  });

  it("rejects bad blocks", async () => {
    for (const body of [
      { ...maintenance, from: "2026-12-19T10:00", to: "2026-12-19T06:00", courtIds: [turf1] },
      { ...maintenance, from: "2026-12-19T06:10", courtIds: [turf1] },
      { ...maintenance, from: "2026-02-30T06:00", courtIds: [turf1] },
      { ...maintenance, courtIds: [turf1], allCourts: true },
      { ...maintenance },
      { ...maintenance, reason: "RAIN", courtIds: [turf1] },
    ]) {
      await create(body).expect(400);
    }
    const tooLong = await create({
      ...maintenance,
      from: "2027-01-01T00:00",
      to: "2027-02-02T00:00",
      courtIds: [turf1],
    }).expect(400);
    expect(tooLong.body.message).toBe("A block can last at most 31 days");
    const elsewhere = await create({ ...maintenance, courtIds: [otherCourt] }).expect(400);
    expect(elsewhere.body.message).toBe("Some of those courts aren't at this venue");
    await list(turf1, "from=2026-12-21&to=2026-12-14").expect(400);
    await list(turf1, "from=2026-01-01&to=2026-06-01").expect(400);
  });

  it("lets staff block a court and remove their own block, but not anyone else's", async () => {
    const res = await create(
      {
        from: "2026-12-20T18:00",
        to: "2026-12-20T20:00",
        reason: "OTHER",
        note: "Rain",
        courtIds: [turf2],
      },
      staff.cookie,
    ).expect(201);
    const staffBlock = blockSchema.array().parse(res.body)[0]!;
    expect(staffBlock.createdBy).toBe(staff.userId);

    await remove(maintenanceBlock.id, staff.cookie).expect(403);
    await remove(staffBlock.id, staff.cookie).expect(204);
    await remove(staffBlock.id, staff.cookie).expect(404);
  });

  it("lets the owner remove any block, and keeps outsiders out", async () => {
    await create({ ...maintenance, courtIds: [turf1] }, outsider.cookie).expect(404);
    await list(turf1, undefined, outsider.cookie).expect(404);
    await remove(maintenanceBlock.id, outsider.cookie).expect(404);
    await remove(maintenanceBlock.id).expect(204);
    await t.http().get(`/courts/${turf1}/blocks?from=2026-12-14&to=2026-12-21`).expect(401);
  });

  it("records blocks and their removal in the audit log", async () => {
    const audit = await t
      .http()
      .get(`/organisations/${organisationId}/audit-log`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const actions = auditEntrySchema
      .array()
      .parse(audit.body)
      .filter((e) => e.entityId === maintenanceBlock.id)
      .map((e) => e.action);
    expect(actions).toEqual(["block.delete", "block.create"]);
  });
});
