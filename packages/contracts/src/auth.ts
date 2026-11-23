import { z } from "zod";

export const phoneSchema = z
  .string()
  .transform((raw) => raw.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"))
  .transform((digits) => `+91${digits}`);

export const otpRequestSchema = z.object({ phone: phoneSchema });
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpRequestResponseSchema = z.object({
  challengeId: z.uuid(),
  expiresInSeconds: z.number().int(),
  resendInSeconds: z.number().int(),
});
export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;

export const otpVerifySchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;

export const googleSignInSchema = z.object({
  idToken: z.string().min(1).max(4096),
});
export type GoogleSignIn = z.infer<typeof googleSignInSchema>;

/** PATCH /auth/me. A number typed in here is saved as unverified (ADR-0007). */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(100).optional(),
    phone: phoneSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.phone !== undefined, {
    message: "Nothing to update",
  });
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const memberRoleSchema = z.enum(["OWNER", "MANAGER", "STAFF"]);

export const staffAccessSchema = z.enum([
  "bookings",
  "checkin",
  "customers",
  "venues",
  "reports",
  "earnings",
  "settings",
]);
export type StaffAccess = z.infer<typeof staffAccessSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    phoneVerified: z.boolean(),
  }),
  memberships: z.array(
    z.object({
      organisationId: z.uuid(),
      role: memberRoleSchema,
      title: z.string().nullable(),
      access: z.array(staffAccessSchema),
      venueIds: z.array(z.uuid()).nullable(),
    }),
  ),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
