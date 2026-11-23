import { z } from "zod";
import { memberRoleSchema, staffAccessSchema, type StaffAccess } from "./auth";

export const ALL_ACCESS = staffAccessSchema.options;

export const roleForAccess = (access: readonly StaffAccess[]): "MANAGER" | "STAFF" =>
  access.includes("settings") ? "MANAGER" : "STAFF";

const accessListSchema = z
  .array(staffAccessSchema)
  .min(1, "Turn on at least one thing they can open")
  .transform((list) => ALL_ACCESS.filter((key) => list.includes(key)));

const venueIdsSchema = z.array(z.uuid()).min(1, "Pick at least one venue").max(50).nullable();

const titleSchema = z.string().trim().min(1, "Give them a role name").max(30);

// TODO(TURF-105): also invite by mobile number once phone OTP sign-in is live (ADR-0007).
export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter their Google account's email").max(254)),
  name: z.string().trim().min(1, "Enter their name").max(100),
  title: titleSchema,
  access: accessListSchema,
  venueIds: venueIdsSchema,
});
export type InviteMember = z.infer<typeof inviteMemberSchema>;

export const updateMemberSchema = z
  .object({
    title: titleSchema.optional(),
    access: accessListSchema.optional(),
    venueIds: venueIdsSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to update",
  });
export type UpdateMember = z.infer<typeof updateMemberSchema>;

export const teamMemberSchema = z.object({
  id: z.uuid(),
  status: z.enum(["ACTIVE", "INVITED"]),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: memberRoleSchema,
  title: z.string().nullable(),
  access: z.array(staffAccessSchema),
  venueIds: z.array(z.uuid()).nullable(),
  lastSignInAt: z.iso.datetime().nullable(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const dashboardSectionSchema = z.enum([
  "overview",
  "bookings",
  "live",
  "venues",
  "availability",
  "customers",
  "staff",
  "earnings",
  "offers",
  "analytics",
  "reviews",
  "marketing",
  "settings",
]);
export type DashboardSection = z.infer<typeof dashboardSectionSchema>;

export const featuresResponseSchema = z.object({ sections: z.array(dashboardSectionSchema) });
export type FeaturesResponse = z.infer<typeof featuresResponseSchema>;
