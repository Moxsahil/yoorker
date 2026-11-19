import { z } from "zod";

export const BLOCK_REASONS = ["MAINTENANCE", "PRIVATE_EVENT", "HOLIDAY", "OTHER"] as const;
export const blockReasonSchema = z.enum(BLOCK_REASONS);
export type BlockReason = z.infer<typeof blockReasonSchema>;

/** The longest single block. */
export const MAX_BLOCK_DAYS = 31;

/** Local date and time at the venue in 15-minute steps, e.g. "2026-12-19T06:00". */
export const localDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):(00|15|30|45)$/,
    "Use YYYY-MM-DDTHH:MM in 15-minute steps",
  )
  .refine((value) => z.iso.date().safeParse(value.slice(0, 10)).success, "Not a real date");

/** Block one or more courts of a venue, or all of them (a holiday, a tournament). */
export const createBlocksSchema = z
  .object({
    courtIds: z.array(z.uuid()).min(1).max(50).optional(),
    allCourts: z.literal(true).optional(),
    /** Local time the block starts; `to` is when the courts can be booked again. */
    from: localDateTimeSchema,
    to: localDateTimeSchema,
    reason: blockReasonSchema,
    note: z.string().trim().min(1).max(200).nullable().default(null),
  })
  .refine((b) => (b.allCourts === true) !== (b.courtIds !== undefined), {
    message: "Choose courts or all courts",
    path: ["courtIds"],
  })
  .refine((b) => b.to > b.from, { message: "The block must end after it starts", path: ["to"] });
export type CreateBlocks = z.infer<typeof createBlocksSchema>;

export const blockSchema = z.object({
  id: z.uuid(),
  courtId: z.uuid(),
  /** Exact instants in UTC. */
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** The same times in the venue's local time, as entered. */
  from: localDateTimeSchema,
  to: localDateTimeSchema,
  reason: blockReasonSchema,
  note: z.string().nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type Block = z.infer<typeof blockSchema>;

/** GET /courts/:id/blocks?from=2026-12-14&to=2026-12-21: local dates, `to` not included. */
export const listBlocksQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((q) => q.to > q.from, { message: "`to` must be after `from`", path: ["to"] });
export type ListBlocksQuery = z.infer<typeof listBlocksQuerySchema>;
