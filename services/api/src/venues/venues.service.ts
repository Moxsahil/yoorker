import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AuditEntry,
  CityInput,
  Court,
  CreateCourt,
  CreateOrganisation,
  CreateVenue,
  Organisation,
  UpdateCourt,
  UpdateVenue,
  Venue,
} from "@yoorker/contracts";
import { point, type Database, type Db, type MemberRole } from "@yoorker/db";
import { sql, type Kysely } from "kysely";
import { AuditService } from "../audit/audit.service";
import { MembershipService } from "../auth/membership.service";
import type { Actor } from "../common/actor";
import { isUniqueViolation } from "../common/pg-errors";
import { DB } from "../database/database.module";

const ANY_MEMBER: readonly MemberRole[] = ["OWNER", "MANAGER", "STAFF"];
const MANAGERS: readonly MemberRole[] = ["OWNER", "MANAGER"];

export interface CourtAccess {
  id: string;
  venueId: string;
  organisationId: string;
  sports: string[];
  timezone: string;
}

function selectVenues(db: Kysely<Database>) {
  return db
    .selectFrom("venue")
    .innerJoin("city", "city.id", "venue.city_id")
    .select([
      "venue.id",
      "venue.organisation_id as organisationId",
      "venue.slug",
      "venue.name",
      "venue.address",
      "venue.locality",
      "venue.pincode",
      "venue.timezone",
      "venue.amenities",
      "venue.rules",
      "venue.is_active as isActive",
      "city.slug as citySlug",
      "city.name as cityName",
      "city.state as cityState",
      sql<number>`ST_Y(venue.location::geometry)`.as("lat"),
      sql<number>`ST_X(venue.location::geometry)`.as("lng"),
    ]);
}

function selectCourts(db: Kysely<Database>) {
  return db
    .selectFrom("court")
    .select([
      "id",
      "venue_id as venueId",
      "name",
      "sports",
      "surface",
      "capacity",
      "is_active as isActive",
    ]);
}

type VenueRow = {
  lat: number;
  lng: number;
  citySlug: string;
  cityName: string;
  cityState: string;
} & Omit<Venue, "location" | "city">;

function toVenue({ lat, lng, citySlug, cityName, cityState, ...rest }: VenueRow): Venue {
  return {
    ...rest,
    city: { slug: citySlug, name: cityName, state: cityState },
    location: { lat, lng },
  };
}

function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "city";
}

async function cityIdFor(
  trx: Kysely<Database>,
  city: CityInput,
  at: { lat: number; lng: number },
): Promise<string> {
  const find = () =>
    trx
      .selectFrom("city")
      .select("id")
      .where(
        sql<boolean>`lower(name) = lower(${city.name}) AND lower(state) = lower(${city.state})`,
      )
      .executeTakeFirst();
  const existing = await find();
  if (existing) return existing.id;
  for (const slug of [slugify(city.name), slugify(`${city.name} ${city.state}`)]) {
    const created = await trx
      .insertInto("city")
      .values({ slug, name: city.name, state: city.state, centroid: point(at.lng, at.lat) })
      .onConflict((oc) => oc.doNothing())
      .returning("id")
      .executeTakeFirst();
    if (created) return created.id;
    // Either another request created this city just now, or the slug belongs to a
    // same-named city in another state.
    const raced = await find();
    if (raced) return raced.id;
  }
  throw new ConflictException("Couldn't save the city. Try again.");
}

@Injectable()
export class VenuesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly memberships: MembershipService,
    private readonly audit: AuditService,
  ) {}

  async createOrganisation(actor: Actor, input: CreateOrganisation): Promise<Organisation> {
    return this.db.transaction().execute(async (trx) => {
      const org = await trx
        .insertInto("organisation")
        .values({ name: input.name })
        .returning(["id", "name"])
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("membership")
        .values({ organisation_id: org.id, user_id: actor.userId, role: "OWNER" })
        .execute();
      await this.audit.record(trx, actor, {
        organisationId: org.id,
        action: "organisation.create",
        entityType: "organisation",
        entityId: org.id,
        after: org,
      });
      return { ...org, role: "OWNER" as const };
    });
  }

  async listOrganisations(userId: string): Promise<Organisation[]> {
    return this.db
      .selectFrom("membership")
      .innerJoin("organisation", "organisation.id", "membership.organisation_id")
      .select(["organisation.id", "organisation.name", "membership.role"])
      .where("membership.user_id", "=", userId)
      .orderBy("organisation.name")
      .execute();
  }

  async listAudit(actor: Actor, organisationId: string): Promise<AuditEntry[]> {
    await this.memberships.requireRole(actor.userId, organisationId, MANAGERS);
    return this.audit.listForOrganisation(organisationId);
  }

  async listVenues(actor: Actor, organisationId: string): Promise<Venue[]> {
    await this.memberships.requireRole(actor.userId, organisationId, ANY_MEMBER);
    const rows = await selectVenues(this.db)
      .where("venue.organisation_id", "=", organisationId)
      .orderBy("venue.name")
      .execute();
    return rows.map(toVenue);
  }

  async createVenue(actor: Actor, organisationId: string, input: CreateVenue): Promise<Venue> {
    await this.memberships.requireRole(actor.userId, organisationId, MANAGERS);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const { id } = await trx
          .insertInto("venue")
          .values({
            organisation_id: organisationId,
            city_id: await cityIdFor(trx, input.city, input.location),
            slug: input.slug,
            name: input.name,
            address: input.address,
            locality: input.locality,
            pincode: input.pincode,
            location: point(input.location.lng, input.location.lat),
            amenities: input.amenities,
            rules: input.rules,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        const venue = toVenue(
          await selectVenues(trx).where("venue.id", "=", id).executeTakeFirstOrThrow(),
        );
        await this.audit.record(trx, actor, {
          organisationId,
          action: "venue.create",
          entityType: "venue",
          entityId: id,
          after: venue,
        });
        return venue;
      });
    } catch (err) {
      if (isUniqueViolation(err, "venue_slug_unique")) {
        throw new ConflictException("That venue link is taken. Choose another slug.");
      }
      throw err;
    }
  }

  async getVenue(actor: Actor, venueId: string, roles = ANY_MEMBER): Promise<Venue> {
    const row = await selectVenues(this.db).where("venue.id", "=", venueId).executeTakeFirst();
    if (!row) throw new NotFoundException("Venue not found");
    await this.memberships.requireRole(actor.userId, row.organisationId, roles).catch((err) => {
      // A non-member must not learn the venue exists.
      throw err instanceof NotFoundException ? new NotFoundException("Venue not found") : err;
    });
    return toVenue(row);
  }

  async updateVenue(actor: Actor, venueId: string, input: UpdateVenue): Promise<Venue> {
    const before = await this.getVenue(actor, venueId, MANAGERS);
    try {
      return await this.db.transaction().execute(async (trx) => {
        await trx
          .updateTable("venue")
          .set({
            slug: input.slug,
            name: input.name,
            address: input.address,
            locality: input.locality,
            pincode: input.pincode,
            amenities: input.amenities,
            rules: input.rules,
            is_active: input.isActive,
            ...(input.location && { location: point(input.location.lng, input.location.lat) }),
            ...(input.city && {
              city_id: await cityIdFor(trx, input.city, input.location ?? before.location),
            }),
          })
          .where("id", "=", venueId)
          .execute();
        const after = toVenue(
          await selectVenues(trx).where("venue.id", "=", venueId).executeTakeFirstOrThrow(),
        );
        await this.audit.record(trx, actor, {
          organisationId: before.organisationId,
          action: "venue.update",
          entityType: "venue",
          entityId: venueId,
          before,
          after,
        });
        return after;
      });
    } catch (err) {
      if (isUniqueViolation(err, "venue_slug_unique")) {
        throw new ConflictException("That venue link is taken. Choose another slug.");
      }
      throw err;
    }
  }

  async getCourtAccess(
    actor: Actor,
    courtId: string,
    roles: readonly MemberRole[] = ANY_MEMBER,
  ): Promise<CourtAccess> {
    const court = await this.db
      .selectFrom("court")
      .innerJoin("venue", "venue.id", "court.venue_id")
      .select(["court.id", "court.venue_id as venueId", "court.sports", "venue.timezone"])
      .where("court.id", "=", courtId)
      .executeTakeFirst();
    if (!court) throw new NotFoundException("Court not found");
    const venue = await this.getVenue(actor, court.venueId, roles).catch((err) => {
      throw err instanceof NotFoundException ? new NotFoundException("Court not found") : err;
    });
    return { ...court, organisationId: venue.organisationId };
  }

  async listCourts(actor: Actor, venueId: string): Promise<Court[]> {
    await this.getVenue(actor, venueId);
    return selectCourts(this.db).where("venue_id", "=", venueId).orderBy("name").execute();
  }

  async createCourt(actor: Actor, venueId: string, input: CreateCourt): Promise<Court> {
    const venue = await this.getVenue(actor, venueId, MANAGERS);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const court = await trx
          .insertInto("court")
          .values({ venue_id: venueId, ...input })
          .returning([
            "id",
            "venue_id as venueId",
            "name",
            "sports",
            "surface",
            "capacity",
            "is_active as isActive",
          ])
          .executeTakeFirstOrThrow();
        await this.audit.record(trx, actor, {
          organisationId: venue.organisationId,
          action: "court.create",
          entityType: "court",
          entityId: court.id,
          after: court,
        });
        return court;
      });
    } catch (err) {
      if (isUniqueViolation(err, "court_name_unique")) {
        throw new ConflictException("This venue already has a court with that name.");
      }
      throw err;
    }
  }

  async updateCourt(actor: Actor, courtId: string, input: UpdateCourt): Promise<Court> {
    const before = await selectCourts(this.db).where("id", "=", courtId).executeTakeFirst();
    if (!before) throw new NotFoundException("Court not found");
    const venue = await this.getVenue(actor, before.venueId, MANAGERS).catch((err) => {
      throw err instanceof NotFoundException ? new NotFoundException("Court not found") : err;
    });
    try {
      return await this.db.transaction().execute(async (trx) => {
        const after = await trx
          .updateTable("court")
          .set({
            name: input.name,
            sports: input.sports,
            surface: input.surface,
            capacity: input.capacity,
            is_active: input.isActive,
          })
          .where("id", "=", courtId)
          .returning([
            "id",
            "venue_id as venueId",
            "name",
            "sports",
            "surface",
            "capacity",
            "is_active as isActive",
          ])
          .executeTakeFirstOrThrow();
        if (input.sports) {
          // Booking lengths for a sport the court no longer offers go with it (TURF-206).
          await trx
            .deleteFrom("court_duration")
            .where("court_id", "=", courtId)
            .where("sport", "is not", null)
            .where("sport", "not in", input.sports)
            .execute();
        }
        await this.audit.record(trx, actor, {
          organisationId: venue.organisationId,
          action: "court.update",
          entityType: "court",
          entityId: courtId,
          before,
          after,
        });
        return after;
      });
    } catch (err) {
      if (isUniqueViolation(err, "court_name_unique")) {
        throw new ConflictException("This venue already has a court with that name.");
      }
      throw err;
    }
  }
}
