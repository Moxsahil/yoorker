import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  CourtPrices,
  PriceQuote,
  PriceQuoteQuery,
  PriceRule,
  UpdateCourtPrices,
} from "@yoorker/contracts";
import type { Database, Db, MemberRole } from "@yoorker/db";
import { sql, type Kysely } from "kysely";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../common/actor";
import { DB } from "../database/database.module";
import { describeMinutes, formatClock, parseClock } from "../schedule/schedule-rules";
import { VenuesService } from "../venues/venues.service";
import { quote, type PriceBook, type StoredPriceRule } from "./pricing";

const ANY_MEMBER: readonly MemberRole[] = ["OWNER", "MANAGER", "STAFF"];
const MANAGERS: readonly MemberRole[] = ["OWNER", "MANAGER"];
const DAY = 1440;

function toStored(rule: PriceRule): StoredPriceRule {
  const fromMinute = parseClock(rule.from);
  let toMinute = parseClock(rule.to);
  // At or before the start: the window ends the next day (00:00-00:00 is the whole day).
  if (toMinute <= fromMinute) toMinute += DAY;
  return {
    name: rule.name,
    weekdays: rule.weekdays,
    onDate: rule.onDate,
    fromMinute,
    toMinute,
    minutes: rule.minutes,
    unit: rule.unit,
    pricePaise: rule.pricePaise,
    priority: rule.priority,
  };
}

function toApi(rule: StoredPriceRule): PriceRule {
  return {
    name: rule.name,
    weekdays: rule.weekdays,
    onDate: rule.onDate,
    from: formatClock(rule.fromMinute),
    to: formatClock(rule.toMinute),
    minutes: rule.minutes,
    unit: rule.unit,
    pricePaise: rule.pricePaise,
    priority: rule.priority,
  };
}

/** A court's base price and rules, as the pricing engine needs them. */
export async function loadPriceBook(db: Kysely<Database>, courtId: string): Promise<PriceBook> {
  const { base_price_per_hour_paise } = await db
    .selectFrom("court")
    .select("base_price_per_hour_paise")
    .where("id", "=", courtId)
    .executeTakeFirstOrThrow();
  const rules = await db
    .selectFrom("price_rule")
    .select([
      "name",
      "weekdays",
      sql<string | null>`on_date::text`.as("onDate"),
      "from_minute as fromMinute",
      "to_minute as toMinute",
      "minutes",
      "unit",
      "price_paise as pricePaise",
      "priority",
    ])
    .where("court_id", "=", courtId)
    .orderBy("position")
    .execute();
  return { basePricePerHourPaise: base_price_per_hour_paise, rules };
}

/** The package price of a booking length; a sport's own length comes first. */
export async function packagePriceFor(
  db: Kysely<Database>,
  courtId: string,
  minutes: number,
  sport?: string,
): Promise<number | null> {
  const lengths = await db
    .selectFrom("court_duration")
    .select(["sport", "price_paise"])
    .where("court_id", "=", courtId)
    .where("minutes", "=", minutes)
    .execute();
  const forSport = lengths.find((d) => sport !== undefined && d.sport === sport);
  const forAll = lengths.find((d) => d.sport === null);
  return (forSport ?? forAll)?.price_paise ?? null;
}

@Injectable()
export class PricingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly venues: VenuesService,
    private readonly audit: AuditService,
  ) {}

  /** Owners and managers see and change prices; staff only get quotes for a booking. */
  async getPrices(actor: Actor, courtId: string): Promise<CourtPrices> {
    const court = await this.venues.getCourtAccess(actor, courtId, MANAGERS);
    return this.toPrices(court.id, await loadPriceBook(this.db, court.id));
  }

  /** Replaces the base price and every rule of the court in one go. */
  async updatePrices(
    actor: Actor,
    courtId: string,
    input: UpdateCourtPrices,
  ): Promise<CourtPrices> {
    const court = await this.venues.getCourtAccess(actor, courtId, MANAGERS);
    const lengths = new Set(
      (
        await this.db
          .selectFrom("court_duration")
          .select("minutes")
          .where("court_id", "=", courtId)
          .execute()
      ).map((d) => d.minutes),
    );
    const issues = input.rules.flatMap((rule, i) =>
      rule.minutes !== null && !lengths.has(rule.minutes)
        ? [
            {
              path: `rules.${i}.minutes`,
              message: `${describeMinutes(rule.minutes)} isn't a booking length of this court`,
            },
          ]
        : [],
    );
    if (issues.length > 0) {
      throw new BadRequestException({ message: "Validation failed", issues });
    }
    return this.db.transaction().execute(async (trx) => {
      // One price change at a time per court.
      await trx.selectFrom("court").select("id").where("id", "=", courtId).forUpdate().execute();
      const before = this.toPrices(courtId, await loadPriceBook(trx, courtId));
      await trx
        .updateTable("court")
        .set({ base_price_per_hour_paise: input.basePricePerHourPaise })
        .where("id", "=", courtId)
        .execute();
      await trx.deleteFrom("price_rule").where("court_id", "=", courtId).execute();
      if (input.rules.length > 0) {
        await trx
          .insertInto("price_rule")
          .values(
            input.rules.map(toStored).map((r, position) => ({
              court_id: courtId,
              name: r.name,
              weekdays: r.weekdays,
              on_date: r.onDate,
              from_minute: r.fromMinute,
              to_minute: r.toMinute,
              minutes: r.minutes,
              unit: r.unit,
              price_paise: r.pricePaise,
              priority: r.priority,
              position,
            })),
          )
          .execute();
      }
      const after = this.toPrices(courtId, await loadPriceBook(trx, courtId));
      await this.audit.record(trx, actor, {
        organisationId: court.organisationId,
        action: "court.prices.update",
        entityType: "court",
        entityId: courtId,
        before,
        after,
      });
      return after;
    });
  }

  /** The price of one booking, for the dashboard and the booking desk. */
  async quote(actor: Actor, courtId: string, query: PriceQuoteQuery): Promise<PriceQuote> {
    const court = await this.venues.getCourtAccess(actor, courtId, ANY_MEMBER);
    const book = await loadPriceBook(this.db, court.id);
    const result = quote(book, {
      date: query.date,
      startMinute: parseClock(query.start),
      minutes: query.minutes,
      packagePricePaise: await packagePriceFor(this.db, court.id, query.minutes, query.sport),
    });
    if (!result) {
      throw new BadRequestException(`No price is set for ${query.date} at ${query.start}`);
    }
    return result;
  }

  private toPrices(courtId: string, book: PriceBook): CourtPrices {
    return {
      courtId,
      basePricePerHourPaise: book.basePricePerHourPaise,
      rules: book.rules.map(toApi),
    };
  }
}
