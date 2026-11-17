import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./testing/test-app";

const DASHBOARD = "https://staging-app.yoorker.com";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ env: { CORS_ORIGINS: DASHBOARD } });
});

afterAll(async () => {
  await t?.close();
});

describe("CORS", () => {
  it("lets the dashboard origin call the API with cookies", async () => {
    const res = await t.http().get("/health").set("Origin", DASHBOARD).expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe(DASHBOARD);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("answers the preflight for a JSON PATCH", async () => {
    const res = await t
      .http()
      .options("/auth/me")
      .set("Origin", DASHBOARD)
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(DASHBOARD);
    expect(res.headers["access-control-allow-methods"]).toContain("PATCH");
  });

  it("gives other origins no allow-origin header, so browsers block them", async () => {
    const res = await t.http().get("/health").set("Origin", "https://evil.example").expect(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
