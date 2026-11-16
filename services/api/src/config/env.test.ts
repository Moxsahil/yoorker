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
});
