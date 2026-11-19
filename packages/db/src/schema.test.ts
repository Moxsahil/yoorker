import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { point } from "./geo";
import { COURT_SURFACES, IDENTITY_PROVIDERS, MEMBER_ROLES, PRICE_UNITS } from "./schema";
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
    expect(await enumValues("identity_provider")).toEqual([...IDENTITY_PROVIDERS]);
    expect(await enumValues("price_unit")).toEqual([...PRICE_UNITS]);
  });

  it("accepts E.164 phone numbers and rejects anything else", async () => {
    await t.db.insertInto("app_user").values({ phone: "+919876543210" }).execute();
    await expect(
      t.db.insertInto("app_user").values({ phone: "9876543210" }).execute(),
    ).rejects.toThrow(/app_user_phone_e164/);
  });

  it("makes a phone number unique only once it is verified", async () => {
    const phone = "+919812345678";
    // Two people can type the same number; neither has proved it.
    await t.db.insertInto("app_user").values({ phone }).execute();
    await t.db.insertInto("app_user").values({ phone }).execute();
    await t.db
      .insertInto("app_user")
      .values({ phone, phone_verified_at: sql<Date>`now()` })
      .execute();
    await expect(
      t.db
        .insertInto("app_user")
        .values({ phone, phone_verified_at: sql<Date>`now()` })
        .execute(),
    ).rejects.toThrow(/app_user_verified_phone_unique/);
    await expect(
      t.db
        .insertInto("app_user")
        .values({ phone_verified_at: sql<Date>`now()` })
        .execute(),
    ).rejects.toThrow(/app_user_phone_verified_needs_phone/);
  });

  it("allows a user with no phone and rejects malformed emails", async () => {
    await t.db
      .insertInto("app_user")
      .values({ email: "rohan@example.com", email_verified_at: sql<Date>`now()` })
      .execute();
    await expect(
      t.db.insertInto("app_user").values({ email: "Rohan@Example.com" }).execute(),
    ).rejects.toThrow(/app_user_email_format/);
  });

  it("links one Google account to only one user", async () => {
    const user = await t.db
      .insertInto("app_user")
      .values({ email: "amit@example.com" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const identity = { user_id: user.id, provider: "GOOGLE" as const, subject: "google-sub-1" };
    await t.db.insertInto("user_identity").values(identity).execute();
    await expect(t.db.insertInto("user_identity").values(identity).execute()).rejects.toThrow(
      /user_identity_provider_subject_unique/,
    );
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

  it("seeds Gurugram as the live launch city", async () => {
    const live = await t.db
      .selectFrom("city")
      .select(["slug", "state"])
      .where("is_live", "=", true)
      .execute();
    expect(live).toEqual([{ slug: "gurugram", state: "Haryana" }]);
  });

  it("allows one city per name and state, ignoring case", async () => {
    const pune = { name: "Pune", state: "Maharashtra", centroid: point(73.8567, 18.5204) };
    await t.db
      .insertInto("city")
      .values({ slug: "pune", ...pune })
      .execute();
    await expect(
      t.db
        .insertInto("city")
        .values({ slug: "pune-2", ...pune, name: "PUNE" })
        .execute(),
    ).rejects.toThrow(/city_name_state_unique/);
  });

  it("checks the venue PIN code and number of rules", async () => {
    const { venueId } = await seedVenue("pincode-turf");
    const update = (set: { pincode?: string; rules?: string[] }) =>
      t.db.updateTable("venue").set(set).where("id", "=", venueId).execute();
    await update({ pincode: "122011" });
    await expect(update({ pincode: "012345" })).rejects.toThrow(/venue_pincode_format/);
    await expect(update({ pincode: "12201" })).rejects.toThrow(/venue_pincode_format/);
    await expect(
      update({ rules: Array.from({ length: 21 }, (_, i) => `Rule ${i}`) }),
    ).rejects.toThrow(/venue_rules_count/);
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

  it("checks court schedules: start step, opening windows and booking lengths", async () => {
    const { venueId } = await seedVenue("schedule-turf");
    const court = await t.db
      .insertInto("court")
      .values({
        venue_id: venueId,
        name: "Court 1",
        sports: ["CRICKET"],
        surface: "NATURAL_GRASS",
        capacity: 22,
      })
      .returning(["id", "start_step_minutes"])
      .executeTakeFirstOrThrow();
    expect(court.start_step_minutes).toBe(30);
    await expect(
      t.db
        .updateTable("court")
        .set({ start_step_minutes: 45 })
        .where("id", "=", court.id)
        .execute(),
    ).rejects.toThrow(/court_start_step/);

    const window = (weekday: number, opens_minute: number, closes_minute: number) =>
      t.db
        .insertInto("opening_hours")
        .values({ court_id: court.id, weekday, opens_minute, closes_minute })
        .execute();
    await window(5, 1080, 1560); // Friday 18:00-02:00
    await expect(window(5, 1200, 1300)).rejects.toThrow(/opening_hours_no_overlap/);
    await expect(window(6, 60, 600)).rejects.toThrow(/opening_hours_no_overlap/); // Sat 01:00
    await window(6, 120, 600); // Sat 02:00 is free
    await expect(window(8, 0, 60)).rejects.toThrow(/opening_hours_weekday/);
    await expect(window(1, 600, 600)).rejects.toThrow(/opening_hours_length/);
    await expect(window(1, 0, 1441)).rejects.toThrow(/opening_hours_length/);

    const duration = (minutes: number, sport: "CRICKET" | null = null) =>
      t.db.insertInto("court_duration").values({ court_id: court.id, minutes, sport }).execute();
    await duration(210, "CRICKET");
    await duration(210);
    await expect(duration(210, "CRICKET")).rejects.toThrow(/court_duration_unique/);
    await expect(duration(10)).rejects.toThrow(/court_duration_minutes/);
    await expect(duration(721)).rejects.toThrow(/court_duration_minutes/);
    await expect(
      t.db
        .insertInto("court_duration")
        .values({ court_id: court.id, minutes: 60, sport: "CHESS" as "CRICKET" })
        .execute(),
    ).rejects.toThrow(/court_duration_sport_valid/);
  });

  it("checks price rules: days or a date, time window, whole rupees", async () => {
    const { venueId } = await seedVenue("price-turf");
    const court = await t.db
      .insertInto("court")
      .values({
        venue_id: venueId,
        name: "Court 1",
        sports: ["CRICKET"],
        surface: "NATURAL_GRASS",
        capacity: 22,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const base = (paise: number) =>
      t.db
        .updateTable("court")
        .set({ base_price_per_hour_paise: paise })
        .where("id", "=", court.id)
        .execute();
    await base(120_000);
    await expect(base(120_050)).rejects.toThrow(/court_base_price/);

    const insert = (overrides: Record<string, unknown>) =>
      t.db
        .insertInto("price_rule")
        .values({
          court_id: court.id,
          name: "Night",
          weekdays: [5],
          from_minute: 1260,
          to_minute: 1800,
          unit: "PER_HOUR",
          price_paise: 600_000,
          ...overrides,
        })
        .execute();
    await insert({});
    const saved = await t.db
      .selectFrom("price_rule")
      .select(["weekdays", sql<string>`on_date::text`.as("onDate")])
      .where("court_id", "=", court.id)
      .executeTakeFirstOrThrow();
    expect(saved).toEqual({ weekdays: [5], onDate: null });
    await insert({ weekdays: [], on_date: "2026-12-31" });
    await expect(insert({ weekdays: [] })).rejects.toThrow(/price_rule_days/);
    await expect(insert({ on_date: "2026-12-31" })).rejects.toThrow(/price_rule_days/);
    await expect(insert({ weekdays: [8] })).rejects.toThrow(/price_rule_days/);
    await expect(insert({ to_minute: 1260 })).rejects.toThrow(/price_rule_length/);
    await expect(insert({ unit: "PER_BOOKING" })).rejects.toThrow(
      /price_rule_per_booking_needs_length/,
    );
    await expect(insert({ price_paise: 600_050 })).rejects.toThrow(/price_rule_price/);
  });
});
