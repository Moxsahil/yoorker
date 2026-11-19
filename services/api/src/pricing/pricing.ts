import type { PriceQuote, PriceUnit } from "@yoorker/contracts";
import { isoWeekday, parseDate } from "../schedule/local-time";
import { formatClock } from "../schedule/schedule-rules";

const DAY = 1440;
/** Hourly prices are worked out in 15-minute parts. */
const PART = 15;

/** A price rule as stored: local minutes; toMinute may pass 1440 (ends the next day). */
export interface StoredPriceRule {
  name: string;
  /** ISO weekdays; empty when onDate is set. */
  weekdays: number[];
  onDate: string | null;
  fromMinute: number;
  toMinute: number;
  /** Only bookings of this length; null means any length. */
  minutes: number | null;
  unit: PriceUnit;
  pricePaise: number;
  priority: number;
}

export interface PriceBook {
  basePricePerHourPaise: number | null;
  /** In display order; earlier wins a tie. */
  rules: StoredPriceRule[];
}

export interface BookingTime {
  /** Local calendar date at the venue, "YYYY-MM-DD". */
  date: string;
  /** Minutes after local midnight on that date. */
  startMinute: number;
  minutes: number;
  /** The booking length's package price, if the owner set one (TURF-206). */
  packagePricePaise: number | null;
}

/** "2026-12-31" plus `days` calendar days. */
export function addDays(date: string, days: number): string {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Whether `rule` covers minute `t` counted from midnight at the start of `date` (t may pass
 * 1440). A rule's window can run past midnight, so yesterday's and today's windows both count.
 */
export function covers(rule: StoredPriceRule, date: string, t: number): boolean {
  for (const k of [-1, 0, 1]) {
    const day = addDays(date, k);
    const onDay =
      rule.onDate !== null ? rule.onDate === day : rule.weekdays.includes(isoWeekday(day));
    if (onDay && k * DAY + rule.fromMinute <= t && t < k * DAY + rule.toMinute) return true;
  }
  return false;
}

/** Whether `a` beats `b`: a date rule beats a weekday rule, then the higher priority wins. */
function outranks(a: StoredPriceRule, b: StoredPriceRule): boolean {
  const aDate = a.onDate !== null;
  const bDate = b.onDate !== null;
  if (aDate !== bDate) return aDate;
  return a.priority > b.priority;
}

/** The rule that applies when several match; on a full tie, the one listed first. */
export function pickRule(
  rules: readonly StoredPriceRule[],
  matches: (rule: StoredPriceRule) => boolean,
): StoredPriceRule | null {
  let best: StoredPriceRule | null = null;
  for (const rule of rules) {
    if (matches(rule) && (best === null || outranks(rule, best))) best = rule;
  }
  return best;
}

/** Hourly price in paise before rounding, with the stretches at each rate; null if unpriced. */
export function hourlyParts(
  book: PriceBook,
  booking: Omit<BookingTime, "packagePricePaise">,
): { totalPaise: number; parts: PriceQuote["parts"] } | null {
  const parts: PriceQuote["parts"] = [];
  let totalPaise = 0;
  for (let offset = 0; offset < booking.minutes; offset += PART) {
    const t = booking.startMinute + offset;
    const rule = pickRule(
      book.rules,
      (r) =>
        r.unit === "PER_HOUR" &&
        (r.minutes === null || r.minutes === booking.minutes) &&
        covers(r, booking.date, t),
    );
    const rate = rule?.pricePaise ?? book.basePricePerHourPaise;
    if (rate === null) return null;
    totalPaise += (rate * PART) / 60;
    const last = parts.at(-1);
    const ruleName = rule?.name ?? null;
    if (last && last.ruleName === ruleName && last.pricePerHourPaise === rate) {
      last.minutes += PART;
    } else {
      parts.push({ from: formatClock(t), minutes: PART, pricePerHourPaise: rate, ruleName });
    }
  }
  return { totalPaise, parts };
}

/** Rounds paise to whole rupees, halves up. */
export function toRupees(paise: number): number {
  return Math.round(paise / 100) * 100;
}

/**
 * The price of one booking. In order: a whole-booking rule for this length that covers the
 * start time; else the length's package price; else each 15 minutes at the per-hour rule
 * for that time, or the base price. Null when some part of the booking has no price.
 */
export function quote(book: PriceBook, booking: BookingTime): PriceQuote | null {
  const bookingRule = pickRule(
    book.rules,
    (r) =>
      r.unit === "PER_BOOKING" &&
      r.minutes === booking.minutes &&
      covers(r, booking.date, booking.startMinute),
  );
  if (bookingRule) {
    return {
      pricePaise: bookingRule.pricePaise,
      source: "BOOKING_RULE",
      ruleName: bookingRule.name,
      parts: [],
    };
  }
  if (booking.packagePricePaise !== null) {
    return { pricePaise: booking.packagePricePaise, source: "PACKAGE", ruleName: null, parts: [] };
  }
  const hourly = hourlyParts(book, booking);
  if (!hourly) return null;
  return {
    pricePaise: toRupees(hourly.totalPaise),
    source: "HOURLY",
    ruleName: null,
    parts: hourly.parts,
  };
}
