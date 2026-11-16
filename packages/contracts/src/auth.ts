import { z } from "zod";

/**
 * An Indian mobile number, normalised to E.164 (+91XXXXXXXXXX).
 * Accepts "98765 43210", "+91 98765-43210", "919876543210" and "09876543210".
 */
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

/** POST /auth/google. The ID token ("credential") from Google Identity Services. */
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

/** Returned by sign-in, GET /auth/me and PATCH /auth/me. */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    /** Null until the user types a number in. Clients ask for one when it is null. */
    phone: z.string().nullable(),
    /** True only after a phone OTP. A typed-in number stays false. */
    phoneVerified: z.boolean(),
  }),
  memberships: z.array(z.object({ organisationId: z.uuid(), role: memberRoleSchema })),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
