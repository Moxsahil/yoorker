import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { startTestDatabase, type TestDatabase } from "@yoorker/db/testing";
import request from "supertest";
import { configureApp } from "../app-setup";
import { AppModule } from "../app.module";
import { OTP_SENDER, type OtpSender } from "../auth/otp-sender";
import { ENV, loadEnv } from "../config/env";

/** Keeps the last code per phone instead of sending it. */
export class CapturingOtpSender implements OtpSender {
  readonly codes = new Map<string, string>();
  async send(phone: string, code: string) {
    this.codes.set(phone, code);
  }
}

export interface TestApp {
  app: NestExpressApplication;
  db: TestDatabase["db"];
  http: () => ReturnType<typeof request>;
  /** Signs in with a 10-digit Indian mobile number; returns the user id and cookie header. */
  signIn(mobile: string): Promise<{ userId: string; cookie: string }>;
  close(): Promise<void>;
}

/** The full API on a throwaway PostGIS database, with the production middleware stack. */
export async function createTestApp(): Promise<TestApp> {
  const t = await startTestDatabase();
  const sender = new CapturingOtpSender();
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: t.connectionString,
    OTP_HASH_SECRET: "test-otp-secret-0123456789abcdef0123",
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(OTP_SENDER)
    .useValue(sender)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();

  const http = () => request(app.getHttpServer());

  return {
    app,
    db: t.db,
    http,
    async signIn(mobile) {
      const asked = await http().post("/auth/otp/request").send({ phone: mobile }).expect(202);
      const verified = await http()
        .post("/auth/otp/verify")
        .send({ challengeId: asked.body.challengeId, code: sender.codes.get(`+91${mobile}`) })
        .expect(200);
      const setCookie = ([] as string[]).concat(verified.headers["set-cookie"] ?? [])[0]!;
      return { userId: verified.body.user.id, cookie: setCookie.split(";")[0]! };
    },
    async close() {
      await app.close();
      await t.stop();
    },
  };
}
