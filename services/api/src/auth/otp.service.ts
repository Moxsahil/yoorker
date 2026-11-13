import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { OtpRequestResponse } from "@yoorker/contracts";
import type { Db } from "@yoorker/db";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { ENV, type Env } from "../config/env";
import { DB } from "../database/database.module";
import { hashOtpCode, newOtpCode, safeEqual } from "./crypto";
import { OTP_SENDER, type OtpSender } from "./otp-sender";

export const OTP_LIMITS = {
  codeTtlSeconds: 300,
  resendAfterSeconds: 30,
  perPhonePerHour: 5,
  perIpPerHour: 20,
  maxAttempts: 5,
} as const;

function tooManyRequests(message: string, retryAfterSeconds: number) {
  return new HttpException({ message, retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
}

@Injectable()
export class OtpService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  /** Sends a new code, unless this phone or IP has asked too often. */
  async request(phone: string, ip: string | null): Promise<OtpRequestResponse> {
    // Counted in the database's clock, so app servers with skewed clocks agree.
    // Two requests at the same instant can both pass; the limits are a brake, not a lock.
    const { rows } = await sql<{ phone_count: number; ip_count: number; last_age: number | null }>`
      SELECT
        (SELECT count(*)::int FROM otp_challenge
          WHERE phone = ${phone} AND created_at > now() - interval '1 hour') AS phone_count,
        (SELECT count(*)::int FROM otp_challenge
          WHERE request_ip = ${ip} AND created_at > now() - interval '1 hour') AS ip_count,
        (SELECT extract(epoch FROM now() - max(created_at))::float8 FROM otp_challenge
          WHERE phone = ${phone}) AS last_age
    `.execute(this.db);
    const stats = rows[0]!;

    if (stats.last_age !== null && stats.last_age < OTP_LIMITS.resendAfterSeconds) {
      throw tooManyRequests(
        "Please wait before asking for another code",
        Math.ceil(OTP_LIMITS.resendAfterSeconds - stats.last_age),
      );
    }
    if (
      stats.phone_count >= OTP_LIMITS.perPhonePerHour ||
      stats.ip_count >= OTP_LIMITS.perIpPerHour
    ) {
      throw tooManyRequests("Too many codes requested. Try again later.", 3600);
    }

    const challengeId = randomUUID();
    const code = newOtpCode();
    await this.db
      .insertInto("otp_challenge")
      .values({
        id: challengeId,
        phone,
        code_hash: hashOtpCode(this.env.OTP_HASH_SECRET, challengeId, code),
        request_ip: ip,
        expires_at: sql<Date>`now() + make_interval(secs => ${OTP_LIMITS.codeTtlSeconds})`,
      })
      .execute();

    await this.sender.send(phone, code);

    return {
      challengeId,
      expiresInSeconds: OTP_LIMITS.codeTtlSeconds,
      resendInSeconds: OTP_LIMITS.resendAfterSeconds,
    };
  }

  /** Checks a code and returns the user id, creating the user on first sign-in. */
  async verify(challengeId: string, code: string): Promise<string> {
    // Spend an attempt first, atomically, so parallel guesses can't exceed the limit.
    const challenge = await this.db
      .updateTable("otp_challenge")
      .set((eb) => ({ attempts: eb("attempts", "+", 1) }))
      .where("id", "=", challengeId)
      .where("consumed_at", "is", null)
      .where("expires_at", ">", sql<Date>`now()`)
      .where("attempts", "<", OTP_LIMITS.maxAttempts)
      .returning(["phone", "code_hash", "attempts"])
      .executeTakeFirst();

    if (!challenge) {
      throw new UnauthorizedException({ message: "Invalid or expired code", attemptsLeft: 0 });
    }
    if (!safeEqual(challenge.code_hash, hashOtpCode(this.env.OTP_HASH_SECRET, challengeId, code))) {
      throw new UnauthorizedException({
        message: "Invalid or expired code",
        attemptsLeft: OTP_LIMITS.maxAttempts - challenge.attempts,
      });
    }

    // Single use: only one of two parallel correct guesses gets through.
    const consumed = await this.db
      .updateTable("otp_challenge")
      .set({ consumed_at: sql<Date>`now()` })
      .where("id", "=", challengeId)
      .where("consumed_at", "is", null)
      .returning("id")
      .executeTakeFirst();
    if (!consumed) {
      throw new UnauthorizedException({ message: "Invalid or expired code", attemptsLeft: 0 });
    }

    const inserted = await this.db
      .insertInto("app_user")
      .values({ phone: challenge.phone })
      .onConflict((oc) => oc.column("phone").doNothing())
      .returning("id")
      .executeTakeFirst();
    if (inserted) return inserted.id;

    const existing = await this.db
      .selectFrom("app_user")
      .select("id")
      .where("phone", "=", challenge.phone)
      .executeTakeFirstOrThrow();
    return existing.id;
  }
}
