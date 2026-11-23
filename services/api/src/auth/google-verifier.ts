import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { OAuth2Client, type LoginTicket } from "google-auth-library";
import { ENV, type Env } from "../config/env";

export const GOOGLE_TOKEN_VERIFIER = Symbol("GOOGLE_TOKEN_VERIFIER");

export interface GoogleProfile {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile | null>;
}

const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

@Injectable()
export class GoogleAuthLibraryVerifier implements GoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(@Inject(ENV) private readonly env: Env) {}

  async verify(idToken: string): Promise<GoogleProfile | null> {
    if (this.env.GOOGLE_CLIENT_IDS.length === 0) {
      throw new ServiceUnavailableException("Google sign-in is not set up on this server");
    }
    // Fetched (and cached) outside the try: Google being unreachable is a 5xx, not a bad token.
    const { certs } = await this.client.getFederatedSignonCertsAsync();

    let ticket: LoginTicket;
    try {
      ticket = await this.client.verifySignedJwtWithCertsAsync(
        idToken,
        certs,
        this.env.GOOGLE_CLIENT_IDS,
        GOOGLE_ISSUERS,
      );
    } catch {
      return null;
    }

    const payload = ticket.getPayload();
    if (!payload?.sub) return null;
    return {
      subject: payload.sub,
      email: payload.email?.toLowerCase() ?? null,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
    };
  }
}
