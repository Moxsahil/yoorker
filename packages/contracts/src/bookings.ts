import { z } from "zod";
import { bookingMinutesSchema, PRICE_SOURCES } from "./pricing";
import { clockTimeSchema } from "./schedule";
import { sportSchema } from "./venues";

export const bookingStatusSchema = z.enum([
  "HELD",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "EXPIRED",
]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const paymentStatusSchema = z.enum(["NOT_PAID", "PAID", "REFUNDED"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const bookingSourceSchema = z.enum(["ONLINE", "WALK_IN", "PHONE"]);
export type BookingSource = z.infer<typeof bookingSourceSchema>;

export const priceSourceSchema = z.enum(PRICE_SOURCES);
export type PriceSource = z.infer<typeof priceSourceSchema>;

export const HOLD_MINUTES = 5;

export const createBookingSchema = z.object({
  date: z.iso.date(),
  start: clockTimeSchema,
  minutes: bookingMinutesSchema,
  sport: sportSchema.optional(),
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,100}$/, "Send 8 to 100 letters, digits, - or _ as the key"),
});
export type CreateBooking = z.infer<typeof createBookingSchema>;

export const bookingSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  courtId: z.uuid(),
  venueId: z.uuid(),
  date: z.iso.date(),
  start: clockTimeSchema,
  end: clockTimeSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  minutes: z.int(),
  sport: sportSchema,
  status: bookingStatusSchema,
  paymentStatus: paymentStatusSchema,
  source: bookingSourceSchema,
  holdExpiresAt: z.iso.datetime().nullable(),
  pricePaise: z.int(),
  priceSource: priceSourceSchema,
  priceRuleName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Booking = z.infer<typeof bookingSchema>;
