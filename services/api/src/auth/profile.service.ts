import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type { MeResponse, UpdateProfile } from "@yoorker/contracts";
import type { Db } from "@yoorker/db";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../common/actor";
import { DB } from "../database/database.module";
import { MembershipService } from "./membership.service";

@Injectable()
export class ProfileService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly memberships: MembershipService,
  ) {}

  /** Updates the name and a typed-in mobile number. A typed number is never marked verified. */
  async update(actor: Actor, input: UpdateProfile): Promise<MeResponse> {
    await this.db.transaction().execute(async (trx) => {
      const before = await trx
        .selectFrom("app_user")
        .select(["name", "phone", "phone_verified_at"])
        .where("id", "=", actor.userId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (
        input.phone !== undefined &&
        before.phone_verified_at !== null &&
        input.phone !== before.phone
      ) {
        throw new ConflictException(
          "Your number is verified. Changing it needs phone sign-in, which isn't available yet.",
        );
      }

      const after = { name: input.name ?? before.name, phone: input.phone ?? before.phone };
      if (after.name === before.name && after.phone === before.phone) return;

      await trx.updateTable("app_user").set(after).where("id", "=", actor.userId).execute();
      await this.audit.record(trx, actor, {
        organisationId: null,
        action: "user.update",
        entityType: "app_user",
        entityId: actor.userId,
        before: { name: before.name, phone: before.phone },
        after,
      });
    });
    return this.memberships.me(actor.userId);
  }
}
