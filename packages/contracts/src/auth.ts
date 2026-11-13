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

export const memberRoleSchema = z.enum(["OWNER", "MANAGER", "STAFF"]);

/** Returned by POST /auth/otp/verify and GET /auth/me. */
export const meResponseSchema = z.object({
  user: z.object({ id: z.uuid(), phone: z.string(), name: z.string().nullable() }),
  memberships: z.array(z.object({ organisationId: z.uuid(), role: memberRoleSchema })),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
