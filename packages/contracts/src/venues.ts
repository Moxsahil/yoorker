import { z } from "zod";
import { memberRoleSchema } from "./auth";

export const sportSchema = z.enum([
  "FOOTBALL",
  "CRICKET",
  "BADMINTON",
  "PICKLEBALL",
  "TENNIS",
  "BASKETBALL",
]);

export const courtSurfaceSchema = z.enum([
  "ARTIFICIAL_TURF",
  "NATURAL_GRASS",
  "HARD_COURT",
  "SYNTHETIC",
  "WOODEN",
  "CLAY",
]);

const text = (max: number) => z.string().trim().min(1).max(max);

export const createOrganisationSchema = z.object({ name: text(100) });
export type CreateOrganisation = z.infer<typeof createOrganisationSchema>;

export const organisationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: memberRoleSchema,
});

export type Organisation = z.infer<typeof organisationSchema>;

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const venueSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

const venueFields = {
  slug: venueSlugSchema,
  name: text(120),
  address: text(300),
  location: locationSchema,
  amenities: z.array(text(40)).max(20),
};

export const createVenueSchema = z.object({
  ...venueFields,
  amenities: venueFields.amenities.default([]),
});

export type CreateVenue = z.infer<typeof createVenueSchema>;

export const updateVenueSchema = z
  .object({
    ...venueFields,
    isActive: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Nothing to update");

export type UpdateVenue = z.infer<typeof updateVenueSchema>;

export const venueSchema = z.object({
  id: z.uuid(),
  organisationId: z.uuid(),
  slug: z.string(),
  name: z.string(),
  address: z.string(),
  location: locationSchema,
  timezone: z.string(),
  amenities: z.array(z.string()),
  isActive: z.boolean(),
});

export type Venue = z.infer<typeof venueSchema>;

const courtFields = {
  name: text(60),
  sports: z
    .array(sportSchema)
    .min(1)
    .max(6)
    .refine((list) => new Set(list).size === list.length, "Each sport can only be added once"),
  surface: courtSurfaceSchema,
  capacity: z.int().min(1).max(50),
};

export const createCourtSchema = z.object(courtFields);
export type CreateCourt = z.infer<typeof createCourtSchema>;

export const updateCourtSchema = z
  .object({
    ...courtFields,
    isActive: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Nothing to update");
export type UpdateCourt = z.infer<typeof updateCourtSchema>;

export const courtSchema = z.object({
  id: z.uuid(),
  venueId: z.uuid(),
  name: z.string(),
  sports: z.array(sportSchema),
  surface: courtSurfaceSchema,
  capacity: z.number().int(),
  isActive: z.boolean(),
});

export type Court = z.infer<typeof courtSchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  actorUserId: z.uuid().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  requestId: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;
