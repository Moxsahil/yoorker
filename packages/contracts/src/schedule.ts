import { z } from "zod";
import { sportSchema } from "./venues";

/** How often a booking can start, and the size of one cell in the slot grid. */
export const START_STEPS = [15, 30, 60] as const;
export const MAX_BOOKING_MINUTES = 12 * 60;

/** Local time in 15-minute steps, e.g. "06:00", "18:30". */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, "Use HH:MM in 15-minute steps, e.g. 06:00");

/**
 * An opening window in the venue's local time. A closing time at or before the opening time
 * ends the next day: 18:00-02:00 runs past midnight, 00:00-00:00 is the full 24 hours.
 */
export const openingWindowSchema = z.object({ opens: clockTimeSchema, closes: clockTimeSchema });
export type OpeningWindow = z.infer<typeof openingWindowSchema>;

/** ISO weekday: 1 = Monday ... 7 = Sunday. A day with no windows is closed. */
export const weekdaySchema = z.int().min(1).max(7);

export const dayScheduleSchema = z.object({
  weekday: weekdaySchema,
  windows: z.array(openingWindowSchema).max(4),
});
export type DaySchedule = z.infer<typeof dayScheduleSchema>;

/** A booking length players can choose, e.g. 60 min football or a 210 min T20 match. */
export const courtDurationSchema = z.object({
  minutes: z.int().min(15).max(MAX_BOOKING_MINUTES),
  /** Shown to players, e.g. "T20 match". */
  label: z.string().trim().min(1).max(40).nullable().default(null),
  /** Only for this sport on a multi-sport court; null means every sport. */
  sport: sportSchema.nullable().default(null),
  /** A fixed package price in paise; null means priced per hour (TURF-201). */
  pricePaise: z.int().min(0).max(10_000_000).nullable().default(null),
});
export type CourtDuration = z.infer<typeof courtDurationSchema>;

export const updateCourtScheduleSchema = z
  .object({
    startStepMinutes: z.union(START_STEPS.map((step) => z.literal(step))),
    durations: z.array(courtDurationSchema).min(1).max(12),
    /** Open 24 hours, every day. Send this or `days`, not both. */
    alwaysOpen: z.literal(true).optional(),
    /** Days left out are closed. */
    days: z.array(dayScheduleSchema).max(7).optional(),
  })
  .refine((s) => (s.alwaysOpen === true) !== (s.days !== undefined), {
    message: "Send either alwaysOpen or days",
    path: ["days"],
  });
export type UpdateCourtSchedule = z.infer<typeof updateCourtScheduleSchema>;

export const courtScheduleSchema = z.object({
  courtId: z.uuid(),
  /** The venue's timezone; all times above are local to it. */
  timezone: z.string(),
  startStepMinutes: z.int(),
  durations: z.array(courtDurationSchema),
  alwaysOpen: z.boolean(),
  /** All seven days, Monday first. */
  days: z.array(dayScheduleSchema).length(7),
});
export type CourtSchedule = z.infer<typeof courtScheduleSchema>;
