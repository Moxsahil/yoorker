import { dashboardSectionSchema } from "@yoorker/contracts";
import { z } from "zod";

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

/** Treats a blank variable (`KEY=` in .env or on Render) as unset. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const R2_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BUCKET",
  "R2_PUBLIC_URL",
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    OTP_HASH_SECRET: z.string().min(32, "OTP_HASH_SECRET must be at least 32 characters"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    GOOGLE_CLIENT_IDS: z
      .string()
      .default("")
      .transform((raw) =>
        raw
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((raw) =>
        raw
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(
        z.array(
          z.string().refine(isOrigin, {
            message: "Each CORS origin must be scheme://host[:port] with no path or trailing slash",
          }),
        ),
      ),
    ENABLED_SECTIONS: z
      .string()
      .default("all")
      .transform((raw) =>
        raw.trim() === "all"
          ? dashboardSectionSchema.options
          : raw
              .split(",")
              .map((section) => section.trim())
              .filter((section) => section.length > 0),
      )
      .pipe(z.array(dashboardSectionSchema)),
    RENDER_GIT_COMMIT: z.string().optional(),
    SENTRY_DSN: optional(z.url()),
    SENTRY_ENVIRONMENT: z
      .string()
      .regex(/^[a-z0-9-]{1,32}$/, "SENTRY_ENVIRONMENT must be lowercase letters, digits or -")
      .optional(),
    /** Cloudflare R2 for venue photos (ADR-0005). Set all five, or none to turn uploads off. */
    R2_ACCOUNT_ID: optional(
      z.string().regex(/^[0-9a-f]{32}$/, "R2_ACCOUNT_ID must be the 32-character account ID"),
    ),
    R2_ACCESS_KEY_ID: optional(z.string().min(1)),
    R2_SECRET_ACCESS_KEY: optional(z.string().min(1)),
    R2_PUBLIC_BUCKET: optional(
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, "R2_PUBLIC_BUCKET must be a bucket name"),
    ),
    R2_PUBLIC_URL: optional(
      z.string().refine(isOrigin, {
        message: "R2_PUBLIC_URL must be scheme://host[:port] with no path or trailing slash",
      }),
    ),
    PHONE_OTP_ENABLED: z.enum(["true", "false"]).optional(),
  })
  .superRefine((env, ctx) => {
    const missing = R2_KEYS.filter((key) => env[key] === undefined);
    if (missing.length > 0 && missing.length < R2_KEYS.length) {
      ctx.addIssue({
        code: "custom",
        path: [missing[0]!],
        message: `Set all R2_* variables or none; missing ${missing.join(", ")}`,
      });
    }
  })
  .transform(
    ({
      PHONE_OTP_ENABLED,
      RENDER_GIT_COMMIT,
      SENTRY_ENVIRONMENT,
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_PUBLIC_BUCKET,
      R2_PUBLIC_URL,
      ...env
    }) => ({
      ...env,
      VERSION: RENDER_GIT_COMMIT ?? "dev",
      SENTRY_ENVIRONMENT: SENTRY_ENVIRONMENT ?? env.NODE_ENV,
      PHONE_OTP_ENABLED:
        PHONE_OTP_ENABLED === undefined
          ? env.NODE_ENV !== "production"
          : PHONE_OTP_ENABLED === "true",
      R2:
        R2_ACCOUNT_ID &&
        R2_ACCESS_KEY_ID &&
        R2_SECRET_ACCESS_KEY &&
        R2_PUBLIC_BUCKET &&
        R2_PUBLIC_URL
          ? {
              accountId: R2_ACCOUNT_ID,
              accessKeyId: R2_ACCESS_KEY_ID,
              secretAccessKey: R2_SECRET_ACCESS_KEY,
              bucket: R2_PUBLIC_BUCKET,
              publicUrl: R2_PUBLIC_URL,
            }
          : null,
    }),
  );

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment: \n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
