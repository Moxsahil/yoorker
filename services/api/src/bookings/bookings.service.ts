import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BOOKING_WINDOW_DAYS,
  HOLD_MINUTES,
  type Booking,
  type CreateBooking,
} from "@yoorker/contracts";
import type { Database, Db } from "@yoorker/db";
import { sql, type Kysely } from "kysely";
import { canSeeVenue, MembershipService } from "../auth/membership.service";
import type { Actor } from "../common/actor";
import { CLOCK, type Clock } from "../common/clock";
import { DB } from "../database/database.module";
import { addDays, quote } from "../pricing/pricing";
import { packagePriceFor } from "../pricing/pricing.service";
import { utcToLocal } from "../schedule/local-time";
import { parseClock, startsForDay } from "../schedule/schedule-rules";
import { SlotsService } from "../slots/slots.service";

const JUST_TAKEN = "Just taken. Pick another time.";

type BookingRow = Awaited<ReturnType<ReturnType<typeof selectBookings>["executeTakeFirstOrThrow"]>>;

function selectBookings(db: Kysely<Database>) {
  return db
    .selectFrom("booking")
    .innerJoin("court", "court.id", "booking.court_id")
    .innerJoin("venue", "venue.id", "court.venue_id")
    .select([
      "booking.id",
      "booking.number",
      "booking.court_id as courtId",
      "court.venue_id as venueId",
      "venue.organisation_id as organisationId",
      "venue.timezone",
      sql<Date>`lower(booking.during)`.as("startsAt"),
      sql<Date>`upper(booking.during)`.as("endsAt"),
      "booking.minutes",
      "booking.sport",
      "booking.status",
      "booking.payment_status as paymentStatus",
      "booking.source",
      "booking.hold_expires_at as holdExpiresAt",
      "booking.player_id as playerId",
      "booking.price_paise as pricePaise",
      "booking.price_source as priceSource",
      "booking.price_rule_name as priceRuleName",
      "booking.idempotency_key as idempotencyKey",
      "booking.created_at as createdAt",
    ]);
}

function toBooking(row: BookingRow): Booking {
  const start = utcToLocal(row.startsAt, row.timezone);
  return {
    id: row.id,
    reference: `BK-${String(row.number).padStart(5, "0")}`,
    courtId: row.courtId,
    venueId: row.venueId,
    date: start.slice(0, 10),
    start: start.slice(11),
    end: utcToLocal(row.endsAt, row.timezone).slice(11),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    minutes: row.minutes,
    sport: row.sport as Booking["sport"],
    status: row.status,
    paymentStatus: row.paymentStatus,
    source: row.source,
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
    pricePaise: row.pricePaise,
    priceSource: row.priceSource,
    priceRuleName: row.priceRuleName,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly slots: SlotsService,
    private readonly memberships: MembershipService,
  ) {}

  async hold(
    actor: Actor,
    courtId: string,
    input: CreateBooking,
  ): Promise<{ booking: Booking; created: boolean }> {
    const earlier = await this.byIdempotencyKey(actor, input.idempotencyKey);
    if (earlier) return { booking: this.sameRequest(earlier, courtId, input), created: false };

    const court = await this.db
      .selectFrom("court")
      .innerJoin("venue", "venue.id", "court.venue_id")
      .select(["court.id", "court.sports", "venue.timezone"])
      .where("court.id", "=", courtId)
      .where("court.is_active", "=", true)
      .where("venue.is_active", "=", true)
      .executeTakeFirst();
    if (!court) throw new NotFoundException("Court not found");

    const sport = input.sport ?? (court.sports.length === 1 ? court.sports[0] : undefined);
    if (!sport) throw new BadRequestException("Pick a sport for this court");
    if (!court.sports.includes(sport)) {
      throw new BadRequestException(`This court doesn't offer ${sport}`);
    }

    const now = this.clock.now();
    const today = utcToLocal(now, court.timezone).slice(0, 10);
    if (input.date < today || input.date > addDays(today, BOOKING_WINDOW_DAYS)) {
      throw new BadRequestException(
        `Pick a date from today up to ${BOOKING_WINDOW_DAYS} days ahead`,
      );
    }
    await this.slots.requireBookingLength(court.id, input.minutes, sport);

    const calendar = await this.slots.calendar(
      court.id,
      court.timezone,
      input.date,
      input.date,
      now,
    );
    const startMinute = parseClock(input.start);
    const slot = startsForDay(calendar, input.date, input.minutes).find(
      (s) => s.startMinute === startMinute,
    );
    if (!slot) throw new BadRequestException("That isn't a start time of this court");
    if (slot.startsAt.getTime() <= now.getTime()) {
      throw new BadRequestException("That time has already started");
    }

    const price = quote(calendar.book, {
      date: input.date,
      startMinute,
      minutes: input.minutes,
      packagePricePaise: await packagePriceFor(this.db, court.id, input.minutes, sport),
    });
    if (!price) throw new BadRequestException("This time has no price, so it can't be booked");

    try {
      const { id } = await this.db
        .insertInto("booking")
        .values({
          court_id: court.id,
          during: sql<string>`tstzrange(${slot.startsAt}, ${slot.endsAt}, '[)')`,
          minutes: input.minutes,
          sport,
          source: "ONLINE",
          hold_expires_at: new Date(now.getTime() + HOLD_MINUTES * 60_000),
          player_id: actor.userId,
          price_paise: price.pricePaise,
          price_source: price.source,
          price_rule_name:
            price.ruleName ?? (price.parts.length === 1 ? price.parts[0]!.ruleName : null),
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return { booking: toBooking(await this.row(id)), created: true };
    } catch (err) {
      const { code, constraint } = err as { code?: string; constraint?: string };
      if (code === "23P01") throw new ConflictException(JUST_TAKEN);
      if (code === "YK001") throw new ConflictException("That time is blocked. Pick another time.");
      if (constraint === "booking_idempotency_unique") {
        const raced = await this.byIdempotencyKey(actor, input.idempotencyKey);
        if (raced) return { booking: this.sameRequest(raced, courtId, input), created: false };
      }
      throw err;
    }
  }

  async get(actor: Actor, bookingId: string): Promise<Booking> {
    const row = await selectBookings(this.db)
      .where("booking.id", "=", bookingId)
      .executeTakeFirst();
    if (!row || !(await this.canSee(actor, row))) throw new NotFoundException("Booking not found");
    return toBooking(row);
  }

  async cancelHold(actor: Actor, bookingId: string): Promise<Booking> {
    const cancelled = await this.db
      .updateTable("booking")
      .set({ status: "CANCELLED" })
      .where("id", "=", bookingId)
      .where("player_id", "=", actor.userId)
      .where("status", "=", "HELD")
      .returning("id")
      .executeTakeFirst();
    if (cancelled) return toBooking(await this.row(cancelled.id));
    const row = await selectBookings(this.db)
      .where("booking.id", "=", bookingId)
      .executeTakeFirst();
    if (!row || row.playerId !== actor.userId) throw new NotFoundException("Booking not found");
    throw new ConflictException("Only a booking still being booked can be cancelled here");
  }

  private async canSee(actor: Actor, row: BookingRow): Promise<boolean> {
    if (row.playerId === actor.userId) return true;
    const membership = await this.memberships
      .requireRole(actor.userId, row.organisationId, ["OWNER", "MANAGER", "STAFF"])
      .catch(() => null);
    return membership !== null && canSeeVenue(membership, row.venueId);
  }

  private row(id: string): Promise<BookingRow> {
    return selectBookings(this.db).where("booking.id", "=", id).executeTakeFirstOrThrow();
  }

  private byIdempotencyKey(actor: Actor, key: string) {
    return selectBookings(this.db)
      .where("booking.created_by", "=", actor.userId)
      .where("booking.idempotency_key", "=", key)
      .executeTakeFirst();
  }

  private sameRequest(row: BookingRow, courtId: string, input: CreateBooking): Booking {
    const booking = toBooking(row);
    const same =
      booking.courtId === courtId &&
      booking.date === input.date &&
      booking.start === input.start &&
      booking.minutes === input.minutes &&
      (input.sport === undefined || booking.sport === input.sport);
    if (!same)
      throw new ConflictException("This idempotency key was already used for another booking");
    return booking;
  }
}
