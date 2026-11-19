import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  BOOKING_WINDOW_DAYS,
  type CourtGrid,
  type CourtSlots,
  type GridQuery,
  type Slot,
  type SlotsQuery,
} from "@yoorker/contracts";
import type { Db, MemberRole } from "@yoorker/db";
import { sql } from "kysely";
import type { Actor } from "../common/actor";
import { CLOCK, type Clock } from "../common/clock";
import { DB } from "../database/database.module";
import { addDays } from "../pricing/pricing";
import { loadPriceBook, packagePriceFor } from "../pricing/pricing.service";
import { localToUtc, utcToLocal } from "../schedule/local-time";
import { describeMinutes } from "../schedule/schedule-rules";
import { VenuesService } from "../venues/venues.service";
import { gridForDay, nextFree, slotsForDay, type CourtCalendar } from "./slot-grid";

const ANY_MEMBER: readonly MemberRole[] = ["OWNER", "MANAGER", "STAFF"];

@Injectable()
export class SlotsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly venues: VenuesService,
  ) {}

  /**
   * Bookable slots for one day, for anyone (no sign-in): only active courts at active
   * venues, only from today up to BOOKING_WINDOW_DAYS ahead, and never slots already started.
   */
  async publicSlots(courtId: string, query: SlotsQuery): Promise<CourtSlots> {
    const court = await this.db
      .selectFrom("court")
      .innerJoin("venue", "venue.id", "court.venue_id")
      .select(["court.id", "venue.timezone"])
      .where("court.id", "=", courtId)
      .where("court.is_active", "=", true)
      .where("venue.is_active", "=", true)
      .executeTakeFirst();
    if (!court) throw new NotFoundException("Court not found");

    const now = this.clock.now();
    const today = utcToLocal(now, court.timezone).slice(0, 10);
    if (query.date < today || query.date > addDays(today, BOOKING_WINDOW_DAYS)) {
      throw new BadRequestException(
        `Pick a date from today up to ${BOOKING_WINDOW_DAYS} days ahead`,
      );
    }
    await this.requireBookingLength(court.id, query);
    const calendar = await this.loadCalendar(court.id, court.timezone, query.date, query.date);
    const packagePrice = await packagePriceFor(this.db, court.id, query.minutes, query.sport);
    const slots = slotsForDay(calendar, query.date, query.minutes, packagePrice, now).filter(
      (slot) => slot.status !== "PAST",
    );
    return {
      courtId: court.id,
      date: query.date,
      minutes: query.minutes,
      timezone: court.timezone,
      slots,
    };
  }

  /** The owner's week grid: every start-step cell inside opening hours, for members. */
  async grid(actor: Actor, courtId: string, query: GridQuery): Promise<CourtGrid> {
    const court = await this.venues.getCourtAccess(actor, courtId, ANY_MEMBER);
    const to = addDays(query.from, query.days - 1);
    const calendar = await this.loadCalendar(court.id, court.timezone, query.from, to);
    const now = this.clock.now();
    return {
      courtId: court.id,
      timezone: court.timezone,
      startStepMinutes: calendar.startStepMinutes,
      days: Array.from({ length: query.days }, (_, i) => {
        const date = addDays(query.from, i);
        return { date, cells: gridForDay(calendar, date, now) };
      }),
    };
  }

  /** The next bookable slots of `minutes` from now, e.g. "free at 6 PM" on venue cards. */
  async nextFreeSlots(
    courtId: string,
    minutes: number,
    options: { count?: number; days?: number; sport?: string } = {},
  ): Promise<Slot[]> {
    const { timezone } = await this.db
      .selectFrom("court")
      .innerJoin("venue", "venue.id", "court.venue_id")
      .select("venue.timezone")
      .where("court.id", "=", courtId)
      .executeTakeFirstOrThrow();
    const now = this.clock.now();
    const today = utcToLocal(now, timezone).slice(0, 10);
    const days = options.days ?? 7;
    const calendar = await this.loadCalendar(courtId, timezone, today, addDays(today, days - 1));
    const packagePrice = await packagePriceFor(this.db, courtId, minutes, options.sport);
    return nextFree(calendar, today, minutes, packagePrice, now, { ...options, days });
  }

  /** The length must be one the court offers, for every sport or the one asked for. */
  private async requireBookingLength(courtId: string, query: SlotsQuery): Promise<void> {
    const lengths = await this.db
      .selectFrom("court_duration")
      .select("sport")
      .where("court_id", "=", courtId)
      .where("minutes", "=", query.minutes)
      .execute();
    if (!lengths.some((d) => d.sport === null || d.sport === query.sport)) {
      throw new BadRequestException(
        `${describeMinutes(query.minutes)} isn't a booking length of this court`,
      );
    }
  }

  /** Schedule, prices and the blocks that touch local dates `from` to `to` (inclusive). */
  private async loadCalendar(
    courtId: string,
    timezone: string,
    from: string,
    to: string,
  ): Promise<CourtCalendar> {
    const { start_step_minutes } = await this.db
      .selectFrom("court")
      .select("start_step_minutes")
      .where("id", "=", courtId)
      .executeTakeFirstOrThrow();
    const windows = await this.db
      .selectFrom("opening_hours")
      .select(["weekday", "opens_minute as opensMinute", "closes_minute as closesMinute"])
      .where("court_id", "=", courtId)
      .execute();
    // A window can run up to a day past its date, so look one day further.
    const rangeStart = localToUtc(from, 0, timezone);
    const rangeEnd = localToUtc(addDays(to, 2), 0, timezone);
    const blocks = await this.db
      .selectFrom("blackout")
      .select([
        "id",
        sql<Date>`lower(during)`.as("startsAt"),
        sql<Date>`upper(during)`.as("endsAt"),
        "reason",
      ])
      .where("court_id", "=", courtId)
      .where(sql<boolean>`during && tstzrange(${rangeStart}, ${rangeEnd}, '[)')`)
      .execute();
    return {
      timezone,
      startStepMinutes: start_step_minutes,
      windows,
      book: await loadPriceBook(this.db, courtId),
      blocks,
    };
  }
}
