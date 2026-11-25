import { z } from "zod";
import { blockReasonSchema } from "./blocks";
import { bookingMinutesSchema } from "./pricing";
import { clockTimeSchema } from "./schedule";
import { sportSchema } from "./venues";

export const BOOKING_WINDOW_DAYS = 30;

export const SLOT_STATUSES = ["FREE", "HELD", "BOOKED", "BLOCKED", "PAST"] as const;
export const slotStatusSchema = z.enum(SLOT_STATUSES);
export type SlotStatus = z.infer<typeof slotStatusSchema>;

export const slotsQuerySchema = z.object({
  date: z.iso.date(),
  minutes: z.coerce.number().pipe(bookingMinutesSchema),
  sport: sportSchema.optional(),
});
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export const slotSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
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

export const gridQuerySchema = z.object({
  from: z.iso.date(),
  days: z.coerce.number().int().min(1).max(14).default(7),
});
export type GridQuery = z.infer<typeof gridQuerySchema>;

export const gridCellSchema = z.object({
  start: clockTimeSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: slotStatusSchema,
  blockId: z.uuid().nullable(),
  blockReason: blockReasonSchema.nullable(),
});
export type GridCell = z.infer<typeof gridCellSchema>;

export const courtGridSchema = z.object({
  courtId: z.uuid(),
  timezone: z.string(),
  startStepMinutes: z.int(),
  days: z.array(z.object({ date: z.iso.date(), cells: z.array(gridCellSchema) })),
});
export type CourtGrid = z.infer<typeof courtGridSchema>;

export const SLOT_CHANGED = "slot_changed";

export const slotChangedSchema = z.object({
  id: z.string(),
  courtId: z.uuid(),
  venueId: z.uuid(),
  from: z.string(),
  to: z.string(),
});
export type SlotChanged = z.infer<typeof slotChangedSchema>;
