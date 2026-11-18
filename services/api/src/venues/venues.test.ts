import {
  auditEntrySchema,
  courtSchema,
  courtSurfaceSchema,
  organisationSchema,
  sportSchema,
  venueSchema,
} from "@yoorker/contracts";
import { COURT_SURFACES, SPORTS } from "@yoorker/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";

let t: TestApp;
let owner: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };
let outsider: { userId: string; cookie: string };
let organisationId: string;
let venueId: string;

const sector57 = {
  slug: "sector-57-turf",
  name: "Sector 57 Turf",
  address: "Sector 57, Gurugram, Haryana",
  location: { lat: 28.4211, lng: 77.0878 },
  city: { name: "Gurugram", state: "Haryana" },
  locality: "Sector 57",
  pincode: "122011",
  amenities: ["Floodlights", "Parking"],
  rules: ["No metal studs", "Arrive 10 minutes early"],
};

beforeAll(async () => {
  t = await createTestApp();
  owner = await t.signIn("9811100001");
  staff = await t.signIn("9811100002");
  outsider = await t.signIn("9811100003");

  const org = await t
    .http()
    .post("/organisations")
    .set("Cookie", owner.cookie)
    .send({ name: "Sector 57 Sports" })
    .expect(201);
  organisationId = organisationSchema.parse(org.body).id;

  // No invite flow yet: add the staff member directly.
  await t.db
    .insertInto("membership")
    .values({ organisation_id: organisationId, user_id: staff.userId, role: "STAFF" })
    .execute();
});

afterAll(async () => {
  await t?.close();
});

describe("contracts match the database", () => {
  it("uses the same sports and surfaces", () => {
    expect(sportSchema.options).toEqual([...SPORTS]);
    expect(courtSurfaceSchema.options).toEqual([...COURT_SURFACES]);
  });
});

describe("Sprint 1 demo: an owner sets up a venue with 2 courts", () => {
  it("creates the venue", async () => {
    const res = await t
      .http()
      .post(`/organisations/${organisationId}/venues`)
      .set("Cookie", owner.cookie)
      .send(sector57)
      .expect(201);
    const venue = venueSchema.parse(res.body);
    expect(venue.location.lat).toBeCloseTo(28.4211, 4);
    expect(venue.timezone).toBe("Asia/Kolkata");
    expect(venue.city).toEqual({ slug: "gurugram", name: "Gurugram", state: "Haryana" });
    expect(venue.locality).toBe("Sector 57");
    expect(venue.pincode).toBe("122011");
    expect(venue.rules).toEqual(["No metal studs", "Arrive 10 minutes early"]);
    venueId = venue.id;
  });

  it("adds two courts", async () => {
    for (const name of ["Box A", "Box B"]) {
      const res = await t
        .http()
        .post(`/venues/${venueId}/courts`)
        .set("Cookie", owner.cookie)
        .send({ name, sports: ["CRICKET", "FOOTBALL"], surface: "ARTIFICIAL_TURF", capacity: 14 })
        .expect(201);
      courtSchema.parse(res.body);
    }
    const list = await t
      .http()
      .get(`/venues/${venueId}/courts`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["Box A", "Box B"]);
  });

  it("records every change in the audit log, with before and after", async () => {
    await t
      .http()
      .patch(`/venues/${venueId}`)
      .set("Cookie", owner.cookie)
      .set("x-request-id", "rename-1")
      .send({ name: "Sector 57 Turf & Cafe" })
      .expect(200);

    const res = await t
      .http()
      .get(`/organisations/${organisationId}/audit-log`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const entries = res.body.map((e: unknown) => auditEntrySchema.parse(e));
    expect(entries.map((e: { action: string }) => e.action)).toEqual([
      "venue.update",
      "court.create",
      "court.create",
      "venue.create",
      "organisation.create",
    ]);
    const rename = entries[0];
    expect(rename.actorUserId).toBe(owner.userId);
    expect(rename.requestId).toBe("rename-1");
    expect(rename.before.name).toBe("Sector 57 Turf");
    expect(rename.after.name).toBe("Sector 57 Turf & Cafe");
  });
});

describe("access rules", () => {
  it("lets staff view but not change", async () => {
    await t.http().get(`/venues/${venueId}`).set("Cookie", staff.cookie).expect(200);
    await t.http().get(`/venues/${venueId}/courts`).set("Cookie", staff.cookie).expect(200);
    await t
      .http()
      .patch(`/venues/${venueId}`)
      .set("Cookie", staff.cookie)
      .send({ name: "Hacked" })
      .expect(403);
    await t
      .http()
      .post(`/venues/${venueId}/courts`)
      .set("Cookie", staff.cookie)
      .send({ name: "Box C", sports: ["CRICKET"], surface: "ARTIFICIAL_TURF", capacity: 10 })
      .expect(403);
    await t
      .http()
      .get(`/organisations/${organisationId}/audit-log`)
      .set("Cookie", staff.cookie)
      .expect(403);
  });

  it("hides other organisations' venues and courts behind 404", async () => {
    await t.http().get(`/venues/${venueId}`).set("Cookie", outsider.cookie).expect(404);
    await t.http().get(`/venues/${venueId}/courts`).set("Cookie", outsider.cookie).expect(404);
    await t
      .http()
      .get(`/organisations/${organisationId}/venues`)
      .set("Cookie", outsider.cookie)
      .expect(404);
    const courts = await t.db.selectFrom("court").select("id").execute();
    await t
      .http()
      .patch(`/courts/${courts[0]!.id}`)
      .set("Cookie", outsider.cookie)
      .send({ isActive: false })
      .expect(404);
  });

  it("requires sign-in", async () => {
    await t.http().get(`/venues/${venueId}`).expect(401);
    await t.http().post("/organisations").send({ name: "Anon" }).expect(401);
  });
});

describe("validation and conflicts", () => {
  it("rejects a taken slug with 409", async () => {
    await t
      .http()
      .post(`/organisations/${organisationId}/venues`)
      .set("Cookie", owner.cookie)
      .send({ ...sector57, name: "Copy" })
      .expect(409);
  });

  it("rejects a duplicate court name with 409", async () => {
    await t
      .http()
      .post(`/venues/${venueId}/courts`)
      .set("Cookie", owner.cookie)
      .send({ name: "Box A", sports: ["CRICKET"], surface: "ARTIFICIAL_TURF", capacity: 14 })
      .expect(409);
  });

  it("rejects bad input with 400", async () => {
    await t
      .http()
      .post(`/venues/${venueId}/courts`)
      .set("Cookie", owner.cookie)
      .send({ name: "Box C", sports: [], surface: "ARTIFICIAL_TURF", capacity: 0 })
      .expect(400);
    await t
      .http()
      .post(`/organisations/${organisationId}/venues`)
      .set("Cookie", owner.cookie)
      .send({ ...sector57, slug: "Bad Slug!" })
      .expect(400);
    await t.http().get("/venues/not-a-uuid").set("Cookie", owner.cookie).expect(400);
  });

  it("deactivates a court", async () => {
    const courts = await t.db.selectFrom("court").select("id").orderBy("name").execute();
    const res = await t
      .http()
      .patch(`/courts/${courts[0]!.id}`)
      .set("Cookie", owner.cookie)
      .send({ isActive: false })
      .expect(200);
    expect(res.body.isActive).toBe(false);
  });
});

describe("cities (TURF-108)", () => {
  const createIn = (
    slug: string,
    city: { name: string; state: string },
    location = { lat: 18.5591, lng: 73.7868 },
  ) =>
    t
      .http()
      .post(`/organisations/${organisationId}/venues`)
      .set("Cookie", owner.cookie)
      .send({ slug, name: slug, address: "Somewhere", location, city });

  it("creates a city the first time and reuses it, ignoring case", async () => {
    const first = venueSchema.parse(
      (await createIn("baner-arena", { name: "Pune", state: "Maharashtra" }).expect(201)).body,
    );
    const second = venueSchema.parse(
      (await createIn("pune-box", { name: "pune", state: "MAHARASHTRA" }).expect(201)).body,
    );
    expect(first.city).toEqual({ slug: "pune", name: "Pune", state: "Maharashtra" });
    expect(second.city.slug).toBe("pune");
    expect(first.locality).toBeNull();
    expect(first.rules).toEqual([]);
    const pune = await t.db
      .selectFrom("city")
      .select("is_live")
      .where("slug", "=", "pune")
      .execute();
    expect(pune).toEqual([{ is_live: false }]);
  });

  it("gives a same-named city in another state its own slug", async () => {
    const mh = venueSchema.parse(
      (await createIn("aurangabad-turf", { name: "Aurangabad", state: "Maharashtra" }).expect(201))
        .body,
    );
    const br = venueSchema.parse(
      (
        await createIn(
          "aurangabad-bihar-turf",
          { name: "Aurangabad", state: "Bihar" },
          { lat: 24.75, lng: 84.37 },
        ).expect(201)
      ).body,
    );
    expect(mh.city.slug).toBe("aurangabad");
    expect(br.city.slug).toBe("aurangabad-bihar");
  });

  it("moves a venue to another city and clears its locality", async () => {
    const res = await t
      .http()
      .patch(`/venues/${venueId}`)
      .set("Cookie", owner.cookie)
      .send({
        city: { name: "Noida", state: "Uttar Pradesh" },
        locality: null,
        location: { lat: 28.627, lng: 77.3727 },
      })
      .expect(200);
    const venue = venueSchema.parse(res.body);
    expect(venue.city.slug).toBe("noida");
    expect(venue.locality).toBeNull();
    expect(venue.pincode).toBe("122011");
  });

  it("rejects a bad PIN code or a missing city with 400", async () => {
    await t
      .http()
      .post(`/organisations/${organisationId}/venues`)
      .set("Cookie", owner.cookie)
      .send({ ...sector57, slug: "bad-pin-turf", pincode: "12345" })
      .expect(400);
    const noCity: Partial<typeof sector57> = { ...sector57 };
    delete noCity.city;
    await t
      .http()
      .post(`/organisations/${organisationId}/venues`)
      .set("Cookie", owner.cookie)
      .send({ ...noCity, slug: "no-city-turf" })
      .expect(400);
  });
});
