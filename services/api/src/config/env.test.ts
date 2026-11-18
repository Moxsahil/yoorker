import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  OTP_HASH_SECRET: "x".repeat(32),
};

describe("loadEnv", () => {
  it("splits GOOGLE_CLIENT_IDS and drops blanks", () => {
    expect(loadEnv({ ...base, GOOGLE_CLIENT_IDS: " a.apps , b.apps ," }).GOOGLE_CLIENT_IDS).toEqual(
      ["a.apps", "b.apps"],
    );
    expect(loadEnv(base).GOOGLE_CLIENT_IDS).toEqual([]);
  });

  it("turns phone OTP off in production unless asked for", () => {
    expect(loadEnv({ ...base, NODE_ENV: "development" }).PHONE_OTP_ENABLED).toBe(true);
    expect(loadEnv({ ...base, NODE_ENV: "production" }).PHONE_OTP_ENABLED).toBe(false);
    expect(
      loadEnv({ ...base, NODE_ENV: "production", PHONE_OTP_ENABLED: "true" }).PHONE_OTP_ENABLED,
    ).toBe(true);
  });

  it("accepts exact origins in CORS_ORIGINS and rejects anything else", () => {
    expect(
      loadEnv({
        ...base,
        CORS_ORIGINS: "https://staging-app.yoorker.com, http://localhost:5173",
      }).CORS_ORIGINS,
    ).toEqual(["https://staging-app.yoorker.com", "http://localhost:5173"]);
    expect(loadEnv(base).CORS_ORIGINS).toEqual([]);
    for (const bad of [
      "https://staging-app.yoorker.com/",
      "https://staging-app.yoorker.com/login",
      "staging-app.yoorker.com",
      "*",
    ]) {
      expect(() => loadEnv({ ...base, CORS_ORIGINS: bad })).toThrow(/CORS origin/);
    }
  });

  it("reports the Render commit as the version, or dev locally", () => {
    expect(loadEnv(base).VERSION).toBe("dev");
    expect(loadEnv({ ...base, RENDER_GIT_COMMIT: "abc1234" }).VERSION).toBe("abc1234");
  });

  it("turns Sentry off without a DSN and names the environment after NODE_ENV", () => {
    expect(loadEnv(base).SENTRY_DSN).toBeUndefined();
    expect(loadEnv({ ...base, SENTRY_DSN: "" }).SENTRY_DSN).toBeUndefined();
    expect(() => loadEnv({ ...base, SENTRY_DSN: "not a url" })).toThrow(/SENTRY_DSN/);
    expect(loadEnv({ ...base, NODE_ENV: "production" }).SENTRY_ENVIRONMENT).toBe("production");
    expect(
      loadEnv({ ...base, NODE_ENV: "production", SENTRY_ENVIRONMENT: "staging" })
        .SENTRY_ENVIRONMENT,
    ).toBe("staging");
    expect(() => loadEnv({ ...base, SENTRY_ENVIRONMENT: "Staging!" })).toThrow(
      /SENTRY_ENVIRONMENT/,
    );
  });

  it("turns R2 photo storage on only when every R2 variable is set", () => {
    const r2 = {
      R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_PUBLIC_BUCKET: "yoorker-staging-public",
      R2_PUBLIC_URL: "https://staging-photos.yoorker.com",
    };
    expect(loadEnv(base).R2).toBeNull();
    expect(loadEnv({ ...base, ...r2 }).R2).toEqual({
      accountId: r2.R2_ACCOUNT_ID,
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "yoorker-staging-public",
      publicUrl: "https://staging-photos.yoorker.com",
    });
    expect(() => loadEnv({ ...base, ...r2, R2_SECRET_ACCESS_KEY: "" })).toThrow(
      /Set all R2_\* variables or none; missing R2_SECRET_ACCESS_KEY/,
    );
    expect(() =>
      loadEnv({ ...base, ...r2, R2_PUBLIC_URL: "https://staging-photos.yoorker.com/" }),
    ).toThrow(/R2_PUBLIC_URL/);
  });
});
