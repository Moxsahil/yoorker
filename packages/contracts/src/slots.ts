import { z } from "zod";
import { blockReasonSchema } from "./blocks";
import { bookingMinutesSchema } from "./pricing";
import { clockTimeSchema } from "./schedule";
import { sportSchema } from "./venues";

/** How far ahead players can see and book. */
export const BOOKING_WINDOW_DAYS = 30;

/**
 * FREE can be booked; BLOCKED is taken out by the owner (TURF-203); PAST has started.
 * HELD (being booked) and BOOKED arrive with bookings in Sprint 3.
 */
export const SLOT_STATUSES = ["FREE", "HELD", "BOOKED", "BLOCKED", "PAST"] as const;
export const slotStatusSchema = z.enum(SLOT_STATUSES);
export type SlotStatus = z.infer<typeof slotStatusSchema>;

/** GET /courts/:id/slots?date=2026-12-19&minutes=210 */
export const slotsQuerySchema = z.object({
  /** Local date at the venue, today up to BOOKING_WINDOW_DAYS ahead. */
  date: z.iso.date(),
  minutes: z.coerce.number().pipe(bookingMinutesSchema),
  /** On a multi-sport court, the sport whose booking lengths and package prices apply. */
  sport: sportSchema.optional(),
});
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

/** One booking a player can make: a start time for the chosen length. */
export const slotSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** Local times; a slot that runs past midnight ends on the next day. */
  start: clockTimeSchema,
  end: clockTimeSchema,
  status: slotStatusSchema,
  /** Null when the owner set no price for this time; such a slot can't be booked. */
  pricePaise: z.int().nullable(),
  ruleName: z.string().nullable(),
});
export type Slot = z.infer<typeof slotSchema>;

export const courtSlotsSchema = z.object({
  courtId: z.uuid(),
  date: z.iso.date(),
  minutes: z.int(),
  timezone: z.string(),
  slots: z.array(slotSchema),
});
export type CourtSlots = z.infer<typeof courtSlotsSchema>;

/** GET /courts/:id/grid?from=2026-12-14&days=7 */
export const gridQuerySchema = z.object({
  from: z.iso.date(),
  days: z.coerce.number().int().min(1).max(14).default(7),
});
export type GridQuery = z.infer<typeof gridQuerySchema>;

/** One start-step cell of the owner's week grid, inside opening hours. */
export const gridCellSchema = z.object({
  start: clockTimeSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: slotStatusSchema,
  /** The block covering this cell, if any. */
  blockId: z.uuid().nullable(),
  blockReason: blockReasonSchema.nullable(),
});
export type GridCell = z.infer<typeof gridCellSchema>;

export const courtGridSchema = z.object({
  courtId: z.uuid(),
  timezone: z.string(),
  startStepMinutes: z.int(),
  /** One entry per local date; a closed day has no cells. */
  days: z.array(z.object({ date: z.iso.date(), cells: z.array(gridCellSchema) })),
});
export type CourtGrid = z.infer<typeof courtGridSchema>;
