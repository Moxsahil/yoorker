import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { MeResponse } from "@yoorker/contracts";
import type { Db, MemberRole } from "@yoorker/db";
import { DB } from "../database/database.module";

@Injectable()
export class MembershipService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async me(userId: string): Promise<MeResponse> {
    const user = await this.db
      .selectFrom("app_user")
      .select(["id", "phone", "name"])
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();
    const memberships = await this.db
      .selectFrom("membership")
      .select(["organisation_id as organisationId", "role"])
      .where("user_id", "=", userId)
      .orderBy("created_at")
      .execute();
    return { user, memberships };
  }

  /**
   * Throws unless the user holds one of `allowed` in the organisation (TURF-102).
   * A non-member gets 404, not 403, so organisation ids can't be probed.
   */
  async requireRole(
    userId: string,
    organisationId: string,
    allowed: readonly MemberRole[],
  ): Promise<MemberRole> {
    const membership = await this.db
      .selectFrom("membership")
      .select("role")
      .where("user_id", "=", userId)
      .where("organisation_id", "=", organisationId)
      .executeTakeFirst();
    if (!membership) throw new NotFoundException("Organisation not found");
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException("Your role can't do this");
    }
    return membership.role;
  }
}
