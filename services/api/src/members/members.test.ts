import {
  auditEntrySchema,
  featuresResponseSchema,
  organisationSchema,
  staffAccessSchema,
  teamMemberSchema,
  venueSchema,
  type TeamMember,
} from "@yoorker/contracts";
import { STAFF_ACCESS } from "@yoorker/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";

let t: TestApp;
let owner: { userId: string; cookie: string };
let organisationId: string;
let northId: string;
let southId: string;

const venue = (slug: string, name: string) => ({
  slug,
  name,
  address: `${name}, Gurugram, Haryana`,
  location: { lat: 28.42, lng: 77.08 },
  city: { name: "Gurugram", state: "Haryana" },
});

const staffInvite = (email: string, extra: object = {}) => ({
  email,
  name: "Sunil Kumar",
  title: "Receptionist",
  access: ["bookings", "checkin", "customers"],
  venueIds: null,
  ...extra,
});

const members = async (cookie = owner.cookie): Promise<TeamMember[]> => {
  const res = await t
    .http()
    .get(`/organisations/${organisationId}/members`)
    .set("Cookie", cookie)
    .expect(200);
  return teamMemberSchema.array().parse(res.body);
};

const invite = (body: object, cookie = owner.cookie) =>
  t.http().post(`/organisations/${organisationId}/members`).set("Cookie", cookie).send(body);

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.signInWithGoogle({ subject: "owner", email: "owner@example.com" });
  const org = await t
    .http()
    .post("/organisations")
    .set("Cookie", owner.cookie)
    .send({ name: "Green Arena" })
    .expect(201);
  organisationId = organisationSchema.parse(org.body).id;
  for (const [slug, name] of [
    ["green-arena-north", "Green Arena North"],
    ["green-arena-south", "Green Arena South"],
  ] as const) {
    const res = await t
      .http()
      .post(`/organisations/${organisationId}/venues`)
      .set("Cookie", owner.cookie)
      .send(venue(slug, name))
      .expect(201);
    const id = venueSchema.parse(res.body).id;
    if (slug.endsWith("north")) northId = id;
    else southId = id;
  }
});

afterAll(async () => {
  await t?.close();
});

describe("contracts match the database", () => {
  it("uses the same access areas", () => {
    expect(staffAccessSchema.options).toEqual([...STAFF_ACCESS]);
  });
});

describe("inviting by email (TURF-105)", () => {
  it("keeps an invite for someone who has never signed in, then adds them when they do", async () => {
    const res = await invite(
      staffInvite("Sunil.Kumar@Example.com", { venueIds: [northId] }),
    ).expect(201);
    const invited = teamMemberSchema.parse(res.body);
    expect(invited).toMatchObject({
      status: "INVITED",
      email: "sunil.kumar@example.com",
      role: "STAFF",
      venueIds: [northId],
    });

    const sunil = await t.signInWithGoogle({
      subject: "sunil",
      email: "sunil.kumar@example.com",
      name: "Sunil Kumar",
    });
    expect(sunil.me.memberships).toEqual([
      {
        organisationId,
        role: "STAFF",
        title: "Receptionist",
        access: ["bookings", "checkin", "customers"],
        venueIds: [northId],
      },
    ]);
    const team = await members();
    expect(team.find((m) => m.email === "sunil.kumar@example.com")).toMatchObject({
      id: sunil.userId,
      status: "ACTIVE",
    });
    expect(team.some((m) => m.status === "INVITED")).toBe(false);
  });

  it("adds someone who already uses Yoorker straight away", async () => {
    const deepak = await t.signInWithGoogle({ subject: "deepak", email: "deepak@example.com" });
    const res = await invite(staffInvite("deepak@example.com")).expect(201);
    expect(teamMemberSchema.parse(res.body)).toMatchObject({
      id: deepak.userId,
      status: "ACTIVE",
    });
  });

  it("refuses the same person twice", async () => {
    await invite(staffInvite("deepak@example.com")).expect(409);
    await invite(staffInvite("pooja@example.com")).expect(201);
    await invite(staffInvite("pooja@example.com")).expect(409);
  });

  it("refuses venues from another business", async () => {
    const other = await t.signInWithGoogle({ subject: "other-owner" });
    const org = await t
      .http()
      .post("/organisations")
      .set("Cookie", other.cookie)
      .send({ name: "Other Turf" })
      .expect(201);
    const res = await t
      .http()
      .post(`/organisations/${organisationSchema.parse(org.body).id}/venues`)
      .set("Cookie", other.cookie)
      .send(venue("other-turf", "Other Turf"))
      .expect(201);
    await invite(
      staffInvite("rahul@example.com", { venueIds: [venueSchema.parse(res.body).id] }),
    ).expect(400);
  });

  it("checks the email, name, role name and access", async () => {
    await invite(staffInvite("not-an-email")).expect(400);
    await invite(staffInvite("a@example.com", { name: " " })).expect(400);
    await invite(staffInvite("a@example.com", { title: "" })).expect(400);
    await invite(staffInvite("a@example.com", { access: [] })).expect(400);
    await invite(staffInvite("a@example.com", { access: ["payroll"] })).expect(400);
    await invite(staffInvite("a@example.com", { venueIds: [] })).expect(400);
  });
});

describe("who can manage whom", () => {
  let manager: { userId: string; cookie: string };
  let staffOnly: { userId: string; cookie: string };

  beforeAll(async () => {
    await invite(
      staffInvite("rajesh@example.com", { title: "Manager", access: [...STAFF_ACCESS] }),
    ).expect(201);
    manager = await t.signInWithGoogle({ subject: "rajesh", email: "rajesh@example.com" });
    staffOnly = await t.signInWithGoogle({ subject: "sunil", email: "sunil.kumar@example.com" });
  });

  it("makes anyone with settings access a manager", async () => {
    const team = await members();
    expect(team.find((m) => m.id === manager.userId)?.role).toBe("MANAGER");
  });

  it("lets a manager add staff, but not another manager", async () => {
    await invite(staffInvite("kavya@example.com"), manager.cookie).expect(201);
    await invite(
      staffInvite("arjun@example.com", { access: ["bookings", "settings"] }),
      manager.cookie,
    ).expect(403);
  });

  it("keeps staff without settings out of the team list", async () => {
    await t
      .http()
      .get(`/organisations/${organisationId}/members`)
      .set("Cookie", staffOnly.cookie)
      .expect(403);
  });

  it("never changes the owner, and nobody changes their own access", async () => {
    await t
      .http()
      .patch(`/organisations/${organisationId}/members/${owner.userId}`)
      .set("Cookie", manager.cookie)
      .send({ title: "Not the owner" })
      .expect(403);
    await t
      .http()
      .patch(`/organisations/${organisationId}/members/${owner.userId}`)
      .set("Cookie", owner.cookie)
      .send({ title: "Boss" })
      .expect(403);
    await t
      .http()
      .delete(`/organisations/${organisationId}/members/${manager.userId}`)
      .set("Cookie", manager.cookie)
      .expect(403);
  });

  it("lets the owner promote staff to manager by turning settings on", async () => {
    const res = await t
      .http()
      .patch(`/organisations/${organisationId}/members/${staffOnly.userId}`)
      .set("Cookie", owner.cookie)
      .send({ access: ["settings", "bookings"] })
      .expect(200);
    expect(teamMemberSchema.parse(res.body)).toMatchObject({
      role: "MANAGER",
      access: ["bookings", "settings"],
    });
    await t
      .http()
      .patch(`/organisations/${organisationId}/members/${staffOnly.userId}`)
      .set("Cookie", owner.cookie)
      .send({ access: ["bookings", "checkin", "customers"] })
      .expect(200);
  });

  it("lets a manager edit and cancel an invite", async () => {
    const kavya = (await members()).find((m) => m.email === "kavya@example.com")!;
    const res = await t
      .http()
      .patch(`/organisations/${organisationId}/members/${kavya.id}`)
      .set("Cookie", manager.cookie)
      .send({ title: "Coach", venueIds: [southId] })
      .expect(200);
    expect(teamMemberSchema.parse(res.body)).toMatchObject({
      status: "INVITED",
      title: "Coach",
      venueIds: [southId],
    });
    await t
      .http()
      .delete(`/organisations/${organisationId}/members/${kavya.id}`)
      .set("Cookie", manager.cookie)
      .expect(204);
    expect((await members()).some((m) => m.email === "kavya@example.com")).toBe(false);
  });

  it("records team changes in the audit log", async () => {
    const res = await t
      .http()
      .get(`/organisations/${organisationId}/audit-log`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const actions = auditEntrySchema
      .array()
      .parse(res.body)
      .map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(["member.invite", "member.add", "member.update", "member.remove"]),
    );
  });
});

describe("venue access", () => {
  let north: { userId: string; cookie: string };

  beforeAll(async () => {
    north = await t.signInWithGoogle({ subject: "sunil", email: "sunil.kumar@example.com" });
  });

  it("shows staff only the venues they work at", async () => {
    const res = await t
      .http()
      .get(`/organisations/${organisationId}/venues`)
      .set("Cookie", north.cookie)
      .expect(200);
    expect(
      venueSchema
        .array()
        .parse(res.body)
        .map((v) => v.id),
    ).toEqual([northId]);
    await t.http().get(`/venues/${southId}`).set("Cookie", north.cookie).expect(404);
    await t.http().get(`/venues/${southId}/courts`).set("Cookie", north.cookie).expect(404);
  });

  it("only lets someone with every venue add a venue", async () => {
    const restricted = await t.signInWithGoogle({ subject: "meera", email: "meera@example.com" });
    await invite(
      staffInvite("meera@example.com", { access: [...STAFF_ACCESS], venueIds: [northId] }),
    ).expect(201);
    await t
      .http()
      .post(`/organisations/${organisationId}/venues`)
      .set("Cookie", restricted.cookie)
      .send(venue("green-arena-east", "Green Arena East"))
      .expect(403);
  });

  it("takes everything away when someone is removed", async () => {
    await t
      .http()
      .delete(`/organisations/${organisationId}/members/${north.userId}`)
      .set("Cookie", owner.cookie)
      .expect(204);
    await t.http().get(`/venues/${northId}`).set("Cookie", north.cookie).expect(404);
  });
});

describe("feature flags", () => {
  it("switches every section on unless told otherwise", async () => {
    const res = await t.http().get("/features").set("Cookie", owner.cookie).expect(200);
    expect(featuresResponseSchema.parse(res.body).sections).toContain("marketing");
  });
});
