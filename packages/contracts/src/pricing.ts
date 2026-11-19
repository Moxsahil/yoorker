import { z } from "zod";
import { clockTimeSchema, MAX_BOOKING_MINUTES, weekdaySchema } from "./schedule";
import { sportSchema } from "./venues";

export const PRICE_UNITS = ["PER_HOUR", "PER_BOOKING"] as const;
export const priceUnitSchema = z.enum(PRICE_UNITS);
export type PriceUnit = z.infer<typeof priceUnitSchema>;

export const MAX_PRICE_RULES = 50;

/** Whole rupees in paise, up to ₹1,00,000. */
export const rupeesInPaiseSchema = z
  .int()
  .min(0)
  .max(10_000_000)
  .refine((paise) => paise % 100 === 0, "Use whole rupees");

/** A booking length in minutes, in 15-minute steps. */
export const bookingMinutesSchema = z
  .int()
  .min(15)
  .max(MAX_BOOKING_MINUTES)
  .refine((m) => m % 15 === 0, "Use 15-minute steps");

/**
 * An owner's price for some days and hours of a court. A booking-length rule prices that
 * length only; `PER_BOOKING` is the price of the whole booking (a 3 h 30 m cricket slot),
 * chosen by when the booking starts. `PER_HOUR` prices each part of a booking at the rate
 * for that time. A time window that ends at or before it starts runs past midnight.
 */
export const priceRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    /** ISO weekdays, 1 = Monday. Send this or `onDate`. */
    weekdays: z.array(weekdaySchema).max(7).default([]),
    /** A single date such as 2026-12-31; beats every weekday rule. */
    onDate: z.iso.date().nullable().default(null),
    from: clockTimeSchema,
    to: clockTimeSchema,
    /** Only bookings of this length; required for PER_BOOKING. */
    minutes: bookingMinutesSchema.nullable().default(null),
    unit: priceUnitSchema,
    pricePaise: rupeesInPaiseSchema,
    /** Higher wins when two rules of the same kind match; 0-100. */
    priority: z.int().min(0).max(100).default(0),
  })
  .refine((r) => (r.onDate === null) === r.weekdays.length > 0, {
    message: "Choose weekdays or a date",
    path: ["weekdays"],
  })
  .refine((r) => new Set(r.weekdays).size === r.weekdays.length, {
    message: "Each weekday only once",
    path: ["weekdays"],
  })
  .refine((r) => r.unit === "PER_HOUR" || r.minutes !== null, {
    message: "A price for the whole booking needs a booking length",
    path: ["minutes"],
  });
export type PriceRule = z.infer<typeof priceRuleSchema>;

export const updateCourtPricesSchema = z.object({
  /** Price per hour when no rule matches; null means times without a rule can't be booked. */
  basePricePerHourPaise: rupeesInPaiseSchema.nullable(),
  /** In display order. */
  rules: z.array(priceRuleSchema).max(MAX_PRICE_RULES),
});
export type UpdateCourtPrices = z.infer<typeof updateCourtPricesSchema>;

export const courtPricesSchema = z.object({
  courtId: z.uuid(),
  basePricePerHourPaise: z.int().nullable(),
  rules: z.array(priceRuleSchema),
});
export type CourtPrices = z.infer<typeof courtPricesSchema>;

/** GET /courts/:id/quote?date=2026-12-19&start=21:00&minutes=210 */
export const priceQuoteQuerySchema = z.object({
  /** Local calendar date at the venue. */
  date: z.iso.date(),
  start: clockTimeSchema,
  minutes: z.coerce.number().pipe(bookingMinutesSchema),
  /** Picks a sport's own package price on a multi-sport court. */
  sport: sportSchema.optional(),
});
export type PriceQuoteQuery = z.infer<typeof priceQuoteQuerySchema>;

export const PRICE_SOURCES = ["BOOKING_RULE", "PACKAGE", "HOURLY"] as const;

export const priceQuoteSchema = z.object({
  pricePaise: z.int(),
  /** Where the price came from: a whole-booking rule, the length's package price, or hourly. */
  source: z.enum(PRICE_SOURCES),
  ruleName: z.string().nullable(),
  /** For hourly prices: each stretch at one rate, e.g. 20:00-21:00 at ₹5,000/h. */
  parts: z.array(
    z.object({
      from: clockTimeSchema,
      minutes: z.int(),
      pricePerHourPaise: z.int(),
      ruleName: z.string().nullable(),
    }),
  ),
});
export type PriceQuote = z.infer<typeof priceQuoteSchema>;
