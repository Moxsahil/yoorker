import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AuditEntry,
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

function selectVenues(db: Kysely<Database>) {
  return db
    .selectFrom("venue")
    .select([
      "id",
      "organisation_id as organisationId",
      "slug",
      "name",
      "address",
      "timezone",
      "amenities",
      "is_active as isActive",
      sql<number>`ST_Y(location::geometry)`.as("lat"),
      sql<number>`ST_X(location::geometry)`.as("lng"),
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

function toVenue({ lat, lng, ...rest }: { lat: number; lng: number } & Omit<Venue, "location">) {
  return { ...rest, location: { lat, lng } };
}

@Injectable()
export class VenuesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly memberships: MembershipService,
    private readonly audit: AuditService,
  ) {}

  // ---- Organisations -----------------------------------------------------

  /** Any signed-in user can start an organisation and becomes its OWNER. */
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

  // ---- Venues ------------------------------------------------------------

  async listVenues(actor: Actor, organisationId: string): Promise<Venue[]> {
    await this.memberships.requireRole(actor.userId, organisationId, ANY_MEMBER);
    const rows = await selectVenues(this.db)
      .where("organisation_id", "=", organisationId)
      .orderBy("name")
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
            slug: input.slug,
            name: input.name,
            address: input.address,
            location: point(input.location.lng, input.location.lat),
            amenities: input.amenities,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        const venue = toVenue(
          await selectVenues(trx).where("id", "=", id).executeTakeFirstOrThrow(),
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

  /** The venue, if the user belongs to its organisation; otherwise 404. */
  async getVenue(actor: Actor, venueId: string, roles = ANY_MEMBER): Promise<Venue> {
    const row = await selectVenues(this.db).where("id", "=", venueId).executeTakeFirst();
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
            amenities: input.amenities,
            is_active: input.isActive,
            ...(input.location && { location: point(input.location.lng, input.location.lat) }),
          })
          .where("id", "=", venueId)
          .execute();
        const after = toVenue(
          await selectVenues(trx).where("id", "=", venueId).executeTakeFirstOrThrow(),
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

  // ---- Courts ------------------------------------------------------------

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
