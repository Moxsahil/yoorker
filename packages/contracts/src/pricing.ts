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

export const bookingMinutesSchema = z
  .int()
  .min(15)
  .max(MAX_BOOKING_MINUTES)
  .refine((m) => m % 15 === 0, "Use 15-minute steps");

export const priceRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    /** ISO weekdays, 1 = Monday. Send this or `onDate`. */
    weekdays: z.array(weekdaySchema).max(7).default([]),
    /** A single date such as 2026-12-31; beats every weekday rule. */
    onDate: z.iso.date().nullable().default(null),
    from: clockTimeSchema,
    to: clockTimeSchema,
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
  rules: z.array(priceRuleSchema).max(MAX_PRICE_RULES),
});
export type UpdateCourtPrices = z.infer<typeof updateCourtPricesSchema>;

export const courtPricesSchema = z.object({
  courtId: z.uuid(),
  basePricePerHourPaise: z.int().nullable(),
  rules: z.array(priceRuleSchema),
});
export type CourtPrices = z.infer<typeof courtPricesSchema>;

export const priceQuoteQuerySchema = z.object({
  date: z.iso.date(),
  start: clockTimeSchema,
  minutes: z.coerce.number().pipe(bookingMinutesSchema),
  sport: sportSchema.optional(),
});
export type PriceQuoteQuery = z.infer<typeof priceQuoteQuerySchema>;

export const PRICE_SOURCES = ["BOOKING_RULE", "PACKAGE", "HOURLY"] as const;

export const priceQuoteSchema = z.object({
  pricePaise: z.int(),
  source: z.enum(PRICE_SOURCES),
  ruleName: z.string().nullable(),
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
