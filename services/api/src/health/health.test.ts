import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { healthResponseSchema } from "@yoorker/contracts";
import { startTestDatabase, type TestDatabase } from "@yoorker/db/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { ENV, loadEnv } from "../config/env";

let t: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  t = await startTestDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", DATABASE_URL: t.connectionString }))
    .compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await t?.stop();
});

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(healthResponseSchema.parse(res.body).db).toBe("ok");
  });

  it("echoes a safe x-request-id and generates one otherwise", async () => {
    const echoed = await request(app.getHttpServer()).get("/health").set("x-request-id", "req-123");
    expect(echoed.headers["x-request-id"]).toBe("req-123");

    const generated = await request(app.getHttpServer())
      .get("/health")
      .set("x-request-id", "bad id with spaces");
    expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
