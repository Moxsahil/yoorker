import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CourtSchedule, UpdateCourtSchedule } from "@yoorker/contracts";
import type { Database, Db, MemberRole } from "@yoorker/db";
import type { Kysely } from "kysely";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../common/actor";
import { DB } from "../database/database.module";
import { VenuesService } from "../venues/venues.service";
import { checkSchedule, toCourtSchedule } from "./schedule-rules";

const ANY_MEMBER: readonly MemberRole[] = ["OWNER", "MANAGER", "STAFF"];
const MANAGERS: readonly MemberRole[] = ["OWNER", "MANAGER"];

interface CourtRef {
  id: string;
  venueId: string;
  sports: string[];
  timezone: string;
  organisationId: string;
}

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly venues: VenuesService,
    private readonly audit: AuditService,
  ) {}

  async getSchedule(actor: Actor, courtId: string): Promise<CourtSchedule> {
    const court = await this.courtFor(actor, courtId, ANY_MEMBER);
    return this.load(this.db, court);
  }

  /** Replaces the court's start step, booking lengths and opening hours in one go. */
  async updateSchedule(
    actor: Actor,
    courtId: string,
    input: UpdateCourtSchedule,
  ): Promise<CourtSchedule> {
    const court = await this.courtFor(actor, courtId, MANAGERS);
    const { windows, issues } = checkSchedule(input, court.sports);
    if (issues.length > 0) {
      throw new BadRequestException({ message: "Validation failed", issues });
    }
    return this.db.transaction().execute(async (trx) => {
      // One schedule change at a time per court.
      await trx.selectFrom("court").select("id").where("id", "=", courtId).forUpdate().execute();
      const before = await this.load(trx, court);
      await trx
        .updateTable("court")
        .set({ start_step_minutes: input.startStepMinutes })
        .where("id", "=", courtId)
        .execute();
      await trx.deleteFrom("opening_hours").where("court_id", "=", courtId).execute();
      if (windows.length > 0) {
        await trx
          .insertInto("opening_hours")
          .values(
            windows.map((w) => ({
              court_id: courtId,
              weekday: w.weekday,
              opens_minute: w.opensMinute,
              closes_minute: w.closesMinute,
            })),
          )
          .execute();
      }
      await trx.deleteFrom("court_duration").where("court_id", "=", courtId).execute();
      await trx
        .insertInto("court_duration")
        .values(
          input.durations.map((d, position) => ({
            court_id: courtId,
            minutes: d.minutes,
            label: d.label,
            sport: d.sport,
            price_paise: d.pricePaise,
            position,
          })),
        )
        .execute();
      const after = await this.load(trx, court);
      await this.audit.record(trx, actor, {
        organisationId: court.organisationId,
        action: "court.schedule.update",
        entityType: "court",
        entityId: courtId,
        before,
        after,
      });
      return after;
    });
  }

  /** The court and its venue's timezone, if the user may see it (or change it); else 404. */
  private async courtFor(
    actor: Actor,
    courtId: string,
    roles: readonly MemberRole[],
  ): Promise<CourtRef> {
    const court = await this.db
      .selectFrom("court")
      .innerJoin("venue", "venue.id", "court.venue_id")
      .select(["court.id", "court.venue_id as venueId", "court.sports", "venue.timezone"])
      .where("court.id", "=", courtId)
      .executeTakeFirst();
    if (!court) throw new NotFoundException("Court not found");
    const venue = await this.venues.getVenue(actor, court.venueId, roles).catch((err) => {
      throw err instanceof NotFoundException ? new NotFoundException("Court not found") : err;
    });
    return { ...court, organisationId: venue.organisationId };
  }

  private async load(db: Kysely<Database>, court: CourtRef): Promise<CourtSchedule> {
    const { start_step_minutes } = await db
      .selectFrom("court")
      .select("start_step_minutes")
      .where("id", "=", court.id)
      .executeTakeFirstOrThrow();
    const windows = await db
      .selectFrom("opening_hours")
      .select(["weekday", "opens_minute as opensMinute", "closes_minute as closesMinute"])
      .where("court_id", "=", court.id)
      .execute();
    const durations = await db
      .selectFrom("court_duration")
      .select(["minutes", "label", "sport", "price_paise as pricePaise"])
      .where("court_id", "=", court.id)
      .orderBy("position")
      .execute();
    return toCourtSchedule({
      courtId: court.id,
      timezone: court.timezone,
      startStepMinutes: start_step_minutes,
      windows,
      durations,
    });
  }
}
