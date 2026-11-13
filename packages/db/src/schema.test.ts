import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { point } from "./geo";
import { COURT_SURFACES, MEMBER_ROLES } from "./schema";
import { startTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
});

afterAll(async () => {
  await t?.stop();
});

// Sector 57, Gurugram
const SECTOR_57 = { lng: 77.0878, lat: 28.4211 };

async function seedVenue(slug: string) {
  const org = await t.db
    .insertInto("organisation")
    .values({ name: "Sector 57 Sports" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const venue = await t.db
    .insertInto("venue")
    .values({
      organisation_id: org.id,
      slug,
      name: "Sector 57 Turf",
      address: "Sector 57, Gurugram, Haryana",
      location: point(SECTOR_57.lng, SECTOR_57.lat),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { orgId: org.id, venueId: venue.id };
}

async function enumValues(type: string): Promise<string[]> {
  const { rows } = await sql<{ v: string }>`
    SELECT unnest(enum_range(NULL::${sql.raw(type)}))::text AS v
  `.execute(t.db);
  return rows.map((r) => r.v);
}

describe("schema", () => {
  it("keeps TypeScript enum lists in sync with Postgres", async () => {
    expect(await enumValues("member_role")).toEqual([...MEMBER_ROLES]);
    expect(await enumValues("court_surface")).toEqual([...COURT_SURFACES]);
  });

  it("accepts E.164 phone numbers and rejects anything else", async () => {
    await t.db.insertInto("app_user").values({ phone: "+919876543210" }).execute();
    await expect(
      t.db.insertInto("app_user").values({ phone: "9876543210" }).execute(),
    ).rejects.toThrow(/app_user_phone_e164/);
    await expect(
      t.db.insertInto("app_user").values({ phone: "+919876543210" }).execute(),
    ).rejects.toThrow(/app_user_phone_unique/);
  });

  it("rejects two courts with the same name at one venue", async () => {
    const { venueId } = await seedVenue("dup-court-turf");
    const court = {
      venue_id: venueId,
      name: "Court 1",
      sports: ["CRICKET" as const],
      surface: "ARTIFICIAL_TURF" as const,
      capacity: 14,
    };
    await t.db.insertInto("court").values(court).execute();
    await expect(t.db.insertInto("court").values(court).execute()).rejects.toThrow(
      /court_name_unique/,
    );
  });

  it("returns sports as a JS array and rejects empty or unknown sports", async () => {
    const { venueId } = await seedVenue("sports-turf");
    const row = await t.db
      .insertInto("court")
      .values({
        venue_id: venueId,
        name: "Box A",
        sports: ["CRICKET", "FOOTBALL"],
        surface: "ARTIFICIAL_TURF",
        capacity: 14,
      })
      .returning("sports")
      .executeTakeFirstOrThrow();
    expect(row.sports).toEqual(["CRICKET", "FOOTBALL"]);

    await expect(
      t.db
        .insertInto("court")
        .values({
          venue_id: venueId,
          name: "Box B",
          sports: [],
          surface: "ARTIFICIAL_TURF",
          capacity: 14,
        })
        .execute(),
    ).rejects.toThrow(/court_sports_valid/);
    await expect(
      t.db
        .insertInto("court")
        .values({
          venue_id: venueId,
          name: "Box C",
          // @ts-expect-error: not a known sport; the database must reject it
          sports: ["KABADDI"],
          surface: "ARTIFICIAL_TURF",
          capacity: 14,
        })
        .execute(),
    ).rejects.toThrow(/court_sports_valid/);
  });

  it("finds a venue within 5 km of a point", async () => {
    const { venueId } = await seedVenue("nearby-turf");
    // About 2 km away, near Sector 56.
    const near = point(77.1, 28.435);
    const rows = await t.db
      .selectFrom("venue")
      .select("id")
      .where(sql<boolean>`ST_DWithin(location, ${near}, 5000)`)
      .execute();
    expect(rows.map((r) => r.id)).toContain(venueId);
  });

  it("bumps updated_at on update", async () => {
    const org = await t.db
      .insertInto("organisation")
      .values({ name: "Before" })
      .returning(["id", "updated_at"])
      .executeTakeFirstOrThrow();
    const after = await t.db
      .updateTable("organisation")
      .set({ name: "After" })
      .where("id", "=", org.id)
      .returning("updated_at")
      .executeTakeFirstOrThrow();
    expect(after.updated_at.getTime()).toBeGreaterThan(org.updated_at.getTime());
  });

  it("keeps the audit log append-only", async () => {
    const entry = await t.db
      .insertInto("audit_log")
      .values({
        action: "venue.create",
        entity_type: "venue",
        entity_id: "x",
        after: { name: "Test" },
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await expect(
      t.db
        .updateTable("audit_log")
        .set({ action: "venue.delete" })
        .where("id", "=", entry.id)
        .execute(),
    ).rejects.toThrow(/append-only/);
    await expect(t.db.deleteFrom("audit_log").where("id", "=", entry.id).execute()).rejects.toThrow(
      /append-only/,
    );
  });
});
