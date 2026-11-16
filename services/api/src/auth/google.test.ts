import { meResponseSchema } from "@yoorker/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t?.close();
});

describe("Google sign-in", () => {
  it("creates a user with no phone on first sign-in and sets an httpOnly cookie", async () => {
    const idToken = t.google.issue({
      subject: "g-rohan",
      email: "rohan@example.com",
      emailVerified: true,
      name: "Rohan",
    });
    const res = await t.http().post("/auth/google").send({ idToken }).expect(200);
    expect(meResponseSchema.parse(res.body).user).toMatchObject({
      name: "Rohan",
      email: "rohan@example.com",
      phone: null,
      phoneVerified: false,
    });
    const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? [])[0];
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("signs the same Google account into the same user and keeps the email current", async () => {
    const first = await t.signInWithGoogle({ subject: "g-amit", email: "amit@example.com" });
    const second = await t.signInWithGoogle({ subject: "g-amit", email: "amit.new@example.com" });
    expect(second.userId).toBe(first.userId);
    expect(second.me.user.email).toBe("amit.new@example.com");
  });

  it("rejects tokens Google didn't issue for us, and empty bodies", async () => {
    await t.http().post("/auth/google").send({ idToken: "forged" }).expect(401);
    await t.http().post("/auth/google").send({}).expect(400);
  });

  it("rejects a Google account whose email isn't verified", async () => {
    const idToken = t.google.issue({
      subject: "g-unverified",
      email: "someone@example.com",
      emailVerified: false,
      name: null,
    });
    await t.http().post("/auth/google").send({ idToken }).expect(401);
  });
});

describe("PATCH /auth/me", () => {
  it("saves a typed-in mobile number as unverified", async () => {
    const { cookie } = await t.signInWithGoogle({ subject: "g-sunil" });
    const res = await t
      .http()
      .patch("/auth/me")
      .set("Cookie", cookie)
      .send({ name: "Sunil", phone: "98111 22233" })
      .expect(200);
    expect(res.body.user).toMatchObject({
      name: "Sunil",
      phone: "+919811122233",
      phoneVerified: false,
    });
    const me = await t.http().get("/auth/me").set("Cookie", cookie).expect(200);
    expect(me.body.user.phone).toBe("+919811122233");
  });

  it("lets two accounts type the same number, since neither has proved it", async () => {
    const a = await t.signInWithGoogle({ subject: "g-priya-1" });
    const b = await t.signInWithGoogle({ subject: "g-priya-2" });
    for (const { cookie } of [a, b]) {
      await t
        .http()
        .patch("/auth/me")
        .set("Cookie", cookie)
        .send({ phone: "9811133344" })
        .expect(200);
    }
  });

  it("validates the body and needs a session", async () => {
    const { cookie } = await t.signInWithGoogle({ subject: "g-validate" });
    await t.http().patch("/auth/me").set("Cookie", cookie).send({ phone: "123" }).expect(400);
    await t.http().patch("/auth/me").set("Cookie", cookie).send({}).expect(400);
    await t.http().patch("/auth/me").send({ name: "Nobody" }).expect(401);
  });

  it("refuses to change a number verified by OTP, but allows a name change", async () => {
    const { cookie } = await t.signIn("9811155566");
    await t
      .http()
      .patch("/auth/me")
      .set("Cookie", cookie)
      .send({ phone: "9811155567" })
      .expect(409);
    const res = await t
      .http()
      .patch("/auth/me")
      .set("Cookie", cookie)
      .send({ name: "Amit" })
      .expect(200);
    expect(res.body.user).toMatchObject({ name: "Amit", phoneVerified: true });
  });

  it("records the change in the audit log", async () => {
    const { userId, cookie } = await t.signInWithGoogle({ subject: "g-audit" });
    await t
      .http()
      .patch("/auth/me")
      .set("Cookie", cookie)
      .send({ phone: "9811177788" })
      .expect(200);
    const rows = await t.db
      .selectFrom("audit_log")
      .select(["action", "after"])
      .where("entity_type", "=", "app_user")
      .where("entity_id", "=", userId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("user.update");
  });
});

describe("with phone OTP switched off", () => {
  let off: TestApp;

  beforeAll(async () => {
    off = await createTestApp({ env: { PHONE_OTP_ENABLED: "false" } });
  });

  afterAll(async () => {
    await off?.close();
  });

  it("answers 503 on the OTP routes and still signs in with Google", async () => {
    await off.http().post("/auth/otp/request").send({ phone: "9811100009" }).expect(503);
    await off.signInWithGoogle({ subject: "g-otp-off" });
  });
});
