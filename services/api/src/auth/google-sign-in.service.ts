import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Db } from "@yoorker/db";
import { sql } from "kysely";
import { isUniqueViolation } from "../common/pg-errors";
import { DB } from "../database/database.module";
import type { GoogleProfile } from "./google-verifier";

@Injectable()
export class GoogleSignInService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Returns the user for a verified Google profile, creating one on first sign-in. */
  async signIn(profile: GoogleProfile): Promise<string> {
    if (!profile.email || !profile.emailVerified) {
      throw new UnauthorizedException("Your Google account's email isn't verified");
    }
    try {
      return await this.findOrCreate(profile, profile.email);
    } catch (err) {
      // Two first sign-ins raced and the other one created the user, so it exists now.
      if (!isUniqueViolation(err, "user_identity_provider_subject_unique")) throw err;
      return this.findOrCreate(profile, profile.email);
    }
  }

  private findOrCreate(profile: GoogleProfile, email: string): Promise<string> {
    return this.db.transaction().execute(async (trx) => {
      const known = await trx
        .updateTable("user_identity")
        .set({ last_used_at: sql<Date>`now()` })
        .where("provider", "=", "GOOGLE")
        .where("subject", "=", profile.subject)
        .returning("user_id")
        .executeTakeFirst();

      if (known) {
        // Google's copy of the email is the current one.
        await trx
          .updateTable("app_user")
          .set({ email, email_verified_at: sql<Date>`now()` })
          .where("id", "=", known.user_id)
          .where("email", "is distinct from", email)
          .execute();
        return known.user_id;
      }

      const user = await trx
        .insertInto("app_user")
        .values({ email, email_verified_at: sql<Date>`now()`, name: cleanName(profile.name) })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("user_identity")
        .values({ user_id: user.id, provider: "GOOGLE", subject: profile.subject })
        .execute();
      return user.id;
    });
  }
}

/** Google display names can be blank or longer than app_user allows. */
function cleanName(name: string | null): string | null {
  const cleaned = name?.trim().slice(0, 100).trim();
  return cleaned ? cleaned : null;
}
