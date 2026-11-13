import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url: 43 characters. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A uniformly random 6-digit code, leading zeros kept. */
export function newOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Keyed with a server secret, so a copy of otp_challenge can't be brute-forced offline
 * (there are only a million codes), and with the challenge id, so equal codes hash apart.
 */
export function hashOtpCode(secret: string, challengeId: string, code: string): string {
  return createHmac("sha256", secret).update(`${challengeId}:${code}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
