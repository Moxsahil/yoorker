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
    await this.requireBookingLength(court.id, query.minutes, query.sport);
    const calendar = await this.calendar(court.id, court.timezone, query.date, query.date, now);
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

  async grid(actor: Actor, courtId: string, query: GridQuery): Promise<CourtGrid> {
    const court = await this.venues.getCourtAccess(actor, courtId, ANY_MEMBER);
    const to = addDays(query.from, query.days - 1);
    const now = this.clock.now();
    const calendar = await this.calendar(court.id, court.timezone, query.from, to, now);
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
    const calendar = await this.calendar(courtId, timezone, today, addDays(today, days - 1), now);
    const packagePrice = await packagePriceFor(this.db, courtId, minutes, options.sport);
    return nextFree(calendar, today, minutes, packagePrice, now, { ...options, days });
  }

  async requireBookingLength(courtId: string, minutes: number, sport?: string): Promise<void> {
    const lengths = await this.db
      .selectFrom("court_duration")
      .select("sport")
      .where("court_id", "=", courtId)
      .where("minutes", "=", minutes)
      .execute();
    if (!lengths.some((d) => d.sport === null || d.sport === sport)) {
      throw new BadRequestException(
        `${describeMinutes(minutes)} isn't a booking length of this court`,
      );
    }
  }

  async calendar(
    courtId: string,
    timezone: string,
    from: string,
    to: string,
    now: Date,
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
    const bookings = await this.db
      .selectFrom("booking")
      .select([
        sql<Date>`lower(during)`.as("startsAt"),
        sql<Date>`upper(during)`.as("endsAt"),
        sql<"HELD" | "CONFIRMED">`status::text`.as("status"),
      ])
      .where("court_id", "=", courtId)
      .where(sql<boolean>`during && tstzrange(${rangeStart}, ${rangeEnd}, '[)')`)
      .where((eb) =>
        eb.or([
          eb("status", "=", "CONFIRMED"),
          eb.and([eb("status", "=", "HELD"), eb("hold_expires_at", ">", now)]),
        ]),
      )
      .execute();
    return {
      timezone,
      startStepMinutes: start_step_minutes,
      windows,
      book: await loadPriceBook(this.db, courtId),
      blocks,
      bookings,
    };
  }
}
