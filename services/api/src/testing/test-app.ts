import type { Type } from "@nestjs/common";
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
import { CLOCK, type Clock } from "../common/clock";
import { ENV, loadEnv } from "../config/env";
import {
  ERROR_REPORTER,
  type ErrorContext,
  type ErrorReporter,
} from "../observability/error-reporter";
import {
  PHOTO_STORAGE,
  type PhotoStorage,
  type PresignedUpload,
  type StoredObject,
} from "../photos/photo-storage";

export class CapturingOtpSender implements OtpSender {
  readonly codes = new Map<string, string>();
  async send(phone: string, code: string) {
    this.codes.set(phone, code);
  }
}

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

export class CapturingErrorReporter implements ErrorReporter {
  readonly reports: { error: unknown; context: ErrorContext }[] = [];
  report(error: unknown, context: ErrorContext) {
    this.reports.push({ error, context });
  }
}

export class FakePhotoStorage implements PhotoStorage {
  readonly objects = new Map<string, StoredObject>();
  readonly deleted: string[] = [];

  async presignUpload(key: string, contentType: string): Promise<PresignedUpload> {
    return {
      url: `https://r2.example.com/${key}?X-Amz-Signature=test`,
      headers: { "Content-Type": contentType },
      expiresAt: new Date(Date.now() + 600_000),
    };
  }

  put(key: string, size: number, contentType: string | undefined): void {
    this.objects.set(key, { size, contentType });
  }

  async head(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);
  }

  publicUrl(key: string): string {
    return `https://photos.example.com/${key}`;
  }
}

/** A clock that stays where a test puts it. Starts on Monday 14 Dec 2026, 06:00 IST. */
export class FakeClock implements Clock {
  private current = new Date("2026-12-14T00:30:00Z");
  now(): Date {
    return new Date(this.current);
  }
  set(instant: string | Date): void {
    this.current = new Date(instant);
  }
}

export interface TestApp {
  app: NestExpressApplication;
  db: TestDatabase["db"];
  http: () => ReturnType<typeof request>;
  google: FakeGoogleVerifier;
  errors: CapturingErrorReporter;
  photos: FakePhotoStorage;
  clock: FakeClock;
  signIn(mobile: string): Promise<{ userId: string; cookie: string }>;
  signInWithGoogle(
    profile: Partial<GoogleProfile> & { subject: string },
  ): Promise<{ userId: string; cookie: string; me: MeResponse }>;
  close(): Promise<void>;
}

export async function createTestApp(
  options: { env?: Record<string, string>; controllers?: Type[] } = {},
): Promise<TestApp> {
  const t = await startTestDatabase();
  const sender = new CapturingOtpSender();
  const google = new FakeGoogleVerifier();
  const errors = new CapturingErrorReporter();
  const photos = new FakePhotoStorage();
  const clock = new FakeClock();
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: t.connectionString,
    OTP_HASH_SECRET: "test-otp-secret-0123456789abcdef0123",
    GOOGLE_CLIENT_IDS: "test-client.apps.googleusercontent.com",
    ...options.env,
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(OTP_SENDER)
    .useValue(sender)
    .overrideProvider(GOOGLE_TOKEN_VERIFIER)
    .useValue(google)
    .overrideProvider(ERROR_REPORTER)
    .useValue(errors)
    .overrideProvider(PHOTO_STORAGE)
    .useValue(photos)
    .overrideProvider(CLOCK)
    .useValue(clock)
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
    errors,
    photos,
    clock,
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
