import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "@yoorker/db";
import type { CookieOptions } from "express";
import { sql } from "kysely";
import type { Env } from "../config/env";
import { DB } from "../database/database.module";
import type { AuthContext } from "./auth-context";
import { hashSessionToken, newSessionToken, SESSION_TOKEN_PATTERN } from "./crypto";

export const SESSION_COOKIE = "yk_session";
export const SESSION_TTL_DAYS = 30;

export function sessionCookieOptions(env: Env): CookieOptions {
  return {
    httpOnly: true, // page JavaScript can't read it
    secure: env.NODE_ENV === "production", // HTTPS only outside local dev
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

@Injectable()
export class SessionService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Starts a session and returns the token for the cookie. Only its hash is stored. */
  async create(userId: string, meta: { userAgent?: string; ip: string | null }) {
    const token = newSessionToken();
    const row = await this.db
      .insertInto("user_session")
      .values({
        user_id: userId,
        token_hash: hashSessionToken(token),
        user_agent: meta.userAgent?.slice(0, 300) ?? null,
        ip: meta.ip,
        expires_at: sql<Date>`now() + make_interval(days => ${SESSION_TTL_DAYS})`,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { token, sessionId: row.id };
  }

  /** The live session for a token, or null if unknown, expired or signed out. */
  async resolve(token: string): Promise<AuthContext | null> {
    if (!SESSION_TOKEN_PATTERN.test(token)) return null;
    const row = await this.db
      .selectFrom("user_session")
      .select(["id", "user_id"])
      .where("token_hash", "=", hashSessionToken(token))
      .where("revoked_at", "is", null)
      .where("expires_at", ">", sql<Date>`now()`)
      .executeTakeFirst();
    return row ? { sessionId: row.id, userId: row.user_id } : null;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db
      .updateTable("user_session")
      .set({ revoked_at: sql<Date>`now()` })
      .where("id", "=", sessionId)
      .where("revoked_at", "is", null)
      .execute();
  }
}
