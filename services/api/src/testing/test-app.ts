import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { meResponseSchema, type MeResponse } from "@yoorker/contracts";
import { startTestDatabase, type TestDatabase } from "@yoorker/db/testing";
import request from "supertest";
import { configureApp } from "../app-setup";
import { AppModule } from "../app.module";
import {
  GOOGLE_TOKEN_VERIFIER,
  type GoogleProfile,
  type GoogleTokenVerifier,
} from "../auth/google-verifier";
import { OTP_SENDER, type OtpSender } from "../auth/otp-sender";
import { ENV, loadEnv } from "../config/env";

/** Keeps the last code per phone instead of sending it. */
export class CapturingOtpSender implements OtpSender {
  readonly codes = new Map<string, string>();
  async send(phone: string, code: string) {
    this.codes.set(phone, code);
  }
}

/** Accepts only tokens handed out by `issue`, instead of asking Google. */
export class FakeGoogleVerifier implements GoogleTokenVerifier {
  private readonly tokens = new Map<string, GoogleProfile>();

  issue(profile: GoogleProfile): string {
    const token = `fake-google-token-${this.tokens.size + 1}`;
    this.tokens.set(token, profile);
    return token;
  }

  async verify(idToken: string): Promise<GoogleProfile | null> {
    return this.tokens.get(idToken) ?? null;
  }
}

export interface TestApp {
  app: NestExpressApplication;
  db: TestDatabase["db"];
  http: () => ReturnType<typeof request>;
  google: FakeGoogleVerifier;
  /** Signs in with a 10-digit Indian mobile number; returns the user id and cookie header. */
  signIn(mobile: string): Promise<{ userId: string; cookie: string }>;
  /** Signs in with a fake Google account; email defaults to <subject>@example.com. */
  signInWithGoogle(
    profile: Partial<GoogleProfile> & { subject: string },
  ): Promise<{ userId: string; cookie: string; me: MeResponse }>;
  close(): Promise<void>;
}

/** The full API on a throwaway PostGIS database, with the production middleware stack. */
export async function createTestApp(
  options: { env?: Record<string, string> } = {},
): Promise<TestApp> {
  const t = await startTestDatabase();
  const sender = new CapturingOtpSender();
  const google = new FakeGoogleVerifier();
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: t.connectionString,
    OTP_HASH_SECRET: "test-otp-secret-0123456789abcdef0123",
    GOOGLE_CLIENT_IDS: "test-client.apps.googleusercontent.com",
    ...options.env,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(OTP_SENDER)
    .useValue(sender)
    .overrideProvider(GOOGLE_TOKEN_VERIFIER)
    .useValue(google)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();

  const http = () => request(app.getHttpServer());

  return {
    app,
    db: t.db,
    http,
    google,
    async signIn(mobile) {
      const asked = await http().post("/auth/otp/request").send({ phone: mobile }).expect(202);
      const verified = await http()
        .post("/auth/otp/verify")
        .send({ challengeId: asked.body.challengeId, code: sender.codes.get(`+91${mobile}`) })
        .expect(200);
      const setCookie = ([] as string[]).concat(verified.headers["set-cookie"] ?? [])[0]!;
      return { userId: verified.body.user.id, cookie: setCookie.split(";")[0]! };
    },
    async signInWithGoogle(profile) {
      const idToken = google.issue({
        email: `${profile.subject}@example.com`,
        emailVerified: true,
        name: "Test Player",
        ...profile,
      });
      const res = await http().post("/auth/google").send({ idToken }).expect(200);
      const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? [])[0]!;
      const me = meResponseSchema.parse(res.body);
      return { userId: me.user.id, cookie: setCookie.split(";")[0]!, me };
    },
    async close() {
      await app.close();
      await t.stop();
    },
  };
}
