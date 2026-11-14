import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  OTP_HASH_SECRET: z.string().min(32, "OTP_HASH_SECRET must be at least 32 characters"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment: \n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
