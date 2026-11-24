import { z } from "zod";
import { PRICE_SOURCES } from "./pricing";

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
