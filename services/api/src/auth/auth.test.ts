import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { meResponseSchema, otpRequestResponseSchema } from "@yoorker/contracts";
import { startTestDatabase, type TestDatabase } from "@yoorker/db/testing";
import { sql } from "kysely";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp } from "../app-setup";
import { AppModule } from "../app.module";
import { ENV, loadEnv } from "../config/env";
import { MembershipService } from "./membership.service";
import { OTP_SENDER, type OtpSender } from "./otp-sender";
import { SESSION_COOKIE } from "./session.service";

/** Keeps the last code per phone instead of sending it. */
class CapturingOtpSender implements OtpSender {
  readonly codes = new Map<string, string>();
  async send(phone: string, code: string) {
    this.codes.set(phone, code);
  }
}

let t: TestDatabase;
let app: NestExpressApplication;
const sender = new CapturingOtpSender();

beforeAll(async () => {
  t = await startTestDatabase();
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
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await t?.stop();
});

const http = () => request(app.getHttpServer());

async function requestCode(phone: string) {
  const res = await http().post("/auth/otp/request").send({ phone }).expect(202);
  return otpRequestResponseSchema.parse(res.body).challengeId;
}

/** Signs in and returns the session cookie header. */
async function signIn(phone: string, e164: string) {
  const challengeId = await requestCode(phone);
  const res = await http()
    .post("/auth/otp/verify")
    .send({ challengeId, code: sender.codes.get(e164) })
    .expect(200);
  const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? [])[0];
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
  return { cookie: cookie!.split(";")[0]!, body: res.body, setCookie: cookie! };
}

describe("auth", () => {
  it("rejects protected routes without a session, and keeps public ones open", async () => {
    await http().get("/auth/me").expect(401);
    await http().post("/auth/logout").expect(401);
    await http().get("/health").expect(200);
  });

  it("signs in with an OTP, sets an httpOnly cookie, and signs out", async () => {
    const { cookie, body, setCookie } = await signIn("98765 43210", "+919876543210");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(meResponseSchema.parse(body).user.phone).toBe("+919876543210");

    const me = await http().get("/auth/me").set("Cookie", cookie).expect(200);
    expect(me.body.user.phone).toBe("+919876543210");

    await http().post("/auth/logout").set("Cookie", cookie).expect(204);
    await http().get("/auth/me").set("Cookie", cookie).expect(401);
  });

  it("signs the same phone into the same user", async () => {
    const first = await signIn("+91 91234 56780", "+919123456780");
    // The resend cooldown applies per phone, so move the first code's timestamp back.
    await sql`UPDATE otp_challenge SET created_at = now() - interval '1 minute'
              WHERE phone = '+919123456780'`.execute(t.db);
    const second = await signIn("09123456780", "+919123456780");
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it("validates the phone number", async () => {
    const res = await http().post("/auth/otp/request").send({ phone: "12345" }).expect(400);
    expect(res.body.issues[0].path).toBe("phone");
  });

  it("enforces the resend cooldown", async () => {
    await requestCode("9000000001");
    const res = await http().post("/auth/otp/request").send({ phone: "9000000001" }).expect(429);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("locks a code after 5 wrong attempts, even if the right code follows", async () => {
    const challengeId = await requestCode("9000000002");
    const right = sender.codes.get("+919000000002")!;
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await http().post("/auth/otp/verify").send({ challengeId, code: wrong }).expect(401);
    }
    await http().post("/auth/otp/verify").send({ challengeId, code: right }).expect(401);
  });

  it("accepts a code only once", async () => {
    const challengeId = await requestCode("9000000003");
    const code = sender.codes.get("+919000000003");
    await http().post("/auth/otp/verify").send({ challengeId, code }).expect(200);
    await http().post("/auth/otp/verify").send({ challengeId, code }).expect(401);
  });

  it("ignores forged session cookies", async () => {
    await http()
      .get("/auth/me")
      .set("Cookie", `${SESSION_COOKIE}=${"a".repeat(43)}`)
      .expect(401);
    await http().get("/auth/me").set("Cookie", `${SESSION_COOKIE}=not-a-token`).expect(401);
  });

  it("stores only hashes of codes and session tokens", async () => {
    const { cookie } = await signIn("9000000004", "+919000000004");
    const token = cookie.split("=")[1]!;
    const sessions = await t.db.selectFrom("user_session").select("token_hash").execute();
    expect(sessions.some((s) => s.token_hash === token)).toBe(false);
    const code = sender.codes.get("+919000000004")!;
    const challenges = await t.db.selectFrom("otp_challenge").select("code_hash").execute();
    expect(challenges.some((c) => c.code_hash === code)).toBe(false);
  });
});

describe("MembershipService.requireRole", () => {
  it("allows listed roles, 403s other roles and 404s non-members", async () => {
    const { body } = await signIn("9000000005", "+919000000005");
    const userId: string = body.user.id;
    const org = await t.db
      .insertInto("organisation")
      .values({ name: "Sector 57 Sports" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto("membership")
      .values({ organisation_id: org.id, user_id: userId, role: "STAFF" })
      .execute();
    const other = await t.db
      .insertInto("organisation")
      .values({ name: "Someone Else's Turf" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const memberships = app.get(MembershipService);
    await expect(memberships.requireRole(userId, org.id, ["OWNER", "STAFF"])).resolves.toBe(
      "STAFF",
    );
    await expect(memberships.requireRole(userId, org.id, ["OWNER"])).rejects.toMatchObject({
      status: 403,
    });
    await expect(memberships.requireRole(userId, other.id, ["OWNER"])).rejects.toMatchObject({
      status: 404,
    });
  });
});
