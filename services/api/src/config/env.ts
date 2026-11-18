import { z } from "zod";

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

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
    /** OAuth client IDs whose Google ID tokens we accept, comma-separated (web now, apps later). */
    GOOGLE_CLIENT_IDS: z
      .string()
      .default("")
      .transform((raw) =>
        raw
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    /**
     * Browser origins allowed to call the API with the session cookie, comma-separated,
     * e.g. https://staging-app.yoorker.com. Empty means no cross-origin access.
     */
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
    /** Set by Render to the deployed commit; reported by /health so deploys can be confirmed. */
    RENDER_GIT_COMMIT: z.string().optional(),
    /** Sentry project DSN. Unset or blank turns error reporting off (local runs, tests). */
    SENTRY_DSN: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
    /** Sentry environment name, e.g. staging. Defaults to NODE_ENV. */
    SENTRY_ENVIRONMENT: z
      .string()
      .regex(/^[a-z0-9-]{1,32}$/, "SENTRY_ENVIRONMENT must be lowercase letters, digits or -")
      .optional(),
    /** Phone OTP sign-in. Off in production by default: the log sender only prints codes (ADR-0007). */
    PHONE_OTP_ENABLED: z.enum(["true", "false"]).optional(),
  })
  .transform(({ PHONE_OTP_ENABLED, RENDER_GIT_COMMIT, SENTRY_ENVIRONMENT, ...env }) => ({
    ...env,
    VERSION: RENDER_GIT_COMMIT ?? "dev",
    SENTRY_ENVIRONMENT: SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    PHONE_OTP_ENABLED:
      PHONE_OTP_ENABLED === undefined
        ? env.NODE_ENV !== "production"
        : PHONE_OTP_ENABLED === "true",
  }));

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment: \n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
