import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  roleForAccess,
  type InviteMember,
  type TeamMember,
  type UpdateMember,
} from "@yoorker/contracts";
import type { Database, Db, MemberRole } from "@yoorker/db";
import { sql, type Kysely } from "kysely";
import { AuditService } from "../audit/audit.service";
import { MembershipService, type Membership } from "../auth/membership.service";
import type { Actor } from "../common/actor";
import { isUniqueViolation } from "../common/pg-errors";
import { DB } from "../database/database.module";

const MANAGERS: readonly MemberRole[] = ["OWNER", "MANAGER"];

@Injectable()
export class MembersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly memberships: MembershipService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor, organisationId: string): Promise<TeamMember[]> {
    await this.memberships.requireRole(actor.userId, organisationId, MANAGERS);
    return team(this.db, organisationId);
  }

  // TODO(TURF-105): invite by mobile number too, once phone OTP sign-in is live (ADR-0007).
  async invite(actor: Actor, organisationId: string, input: InviteMember): Promise<TeamMember> {
    const me = await this.memberships.requireRole(actor.userId, organisationId, MANAGERS);
    const role = roleForAccess(input.access);
    assertCanManage(me, role);
    await this.assertVenuesBelong(organisationId, input.venueIds);

    return this.db.transaction().execute(async (trx) => {
      const user = await trx
        .selectFrom("app_user")
        .select("id")
        .where("email", "=", input.email)
        .where("email_verified_at", "is not", null)
        .executeTakeFirst();

      if (user) {
        const added = await trx
          .insertInto("membership")
          .values({
            organisation_id: organisationId,
            user_id: user.id,
            role,
            title: input.title,
            access: input.access,
            venue_ids: input.venueIds,
          })
          .onConflict((oc) => oc.columns(["organisation_id", "user_id"]).doNothing())
          .returning("user_id")
          .executeTakeFirst();
        if (!added) throw new ConflictException("They're already on your team");
        await this.record(trx, actor, organisationId, "member.add", user.id, null, input);
        return findMember(trx, organisationId, user.id);
      }

      const invite = await trx
        .insertInto("member_invite")
        .values({
          organisation_id: organisationId,
          email: input.email,
          name: input.name,
          role,
          title: input.title,
          access: input.access,
          venue_ids: input.venueIds,
          invited_by: actor.userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
        .catch((err: unknown) => {
          if (isUniqueViolation(err, "member_invite_org_email_unique")) {
            throw new ConflictException("You've already invited this email");
          }
          throw err;
        });
      await this.record(trx, actor, organisationId, "member.invite", invite.id, null, input);
      return findMember(trx, organisationId, invite.id);
    });
  }

  async update(
    actor: Actor,
    organisationId: string,
    memberId: string,
    input: UpdateMember,
  ): Promise<TeamMember> {
    const me = await this.memberships.requireRole(actor.userId, organisationId, MANAGERS);
    const before = await findMember(this.db, organisationId, memberId);
    if (memberId === actor.userId) throw new ForbiddenException("You can't change your own access");
    assertCanManage(me, before.role);
    const role = input.access ? roleForAccess(input.access) : before.role;
    assertCanManage(me, role);
    if (input.venueIds !== undefined) await this.assertVenuesBelong(organisationId, input.venueIds);

    const changes = {
      role,
      title: input.title,
      access: input.access,
      venue_ids: input.venueIds,
    };
    return this.db.transaction().execute(async (trx) => {
      if (before.status === "ACTIVE") {
        await trx
          .updateTable("membership")
          .set(changes)
          .where("organisation_id", "=", organisationId)
          .where("user_id", "=", memberId)
          .execute();
      } else {
        await trx
          .updateTable("member_invite")
          .set(changes)
          .where("organisation_id", "=", organisationId)
          .where("id", "=", memberId)
          .execute();
      }
      const after = await findMember(trx, organisationId, memberId);
      await this.record(trx, actor, organisationId, "member.update", memberId, before, after);
      return after;
    });
  }

  async remove(actor: Actor, organisationId: string, memberId: string): Promise<void> {
    const me = await this.memberships.requireRole(actor.userId, organisationId, MANAGERS);
    const before = await findMember(this.db, organisationId, memberId);
    if (memberId === actor.userId) throw new ForbiddenException("You can't remove yourself");
    assertCanManage(me, before.role);

    await this.db.transaction().execute(async (trx) => {
      if (before.status === "ACTIVE") {
        await trx
          .deleteFrom("membership")
          .where("organisation_id", "=", organisationId)
          .where("user_id", "=", memberId)
          .execute();
      } else {
        await trx
          .deleteFrom("member_invite")
          .where("organisation_id", "=", organisationId)
          .where("id", "=", memberId)
          .execute();
      }
      await this.record(trx, actor, organisationId, "member.remove", memberId, before, null);
    });
  }

  private async assertVenuesBelong(organisationId: string, venueIds: string[] | null) {
    if (venueIds === null) return;
    const found = await this.db
      .selectFrom("venue")
      .select("id")
      .where("organisation_id", "=", organisationId)
      .where("deleted_at", "is", null)
      .where("id", "in", venueIds)
      .execute();
    if (found.length !== new Set(venueIds).size) {
      throw new BadRequestException("Pick venues from your own business");
    }
  }

  private record(
    trx: Kysely<Database>,
    actor: Actor,
    organisationId: string,
    action: string,
    entityId: string,
    before: object | null,
    after: object | null,
  ) {
    return this.audit.record(trx, actor, {
      organisationId,
      action,
      entityType: "member",
      entityId,
      before,
      after,
    });
  }
}

function assertCanManage(me: Membership, target: MemberRole) {
  if (target === "OWNER") throw new ForbiddenException("The owner's access can't be changed");
  if (target === "MANAGER" && me.role !== "OWNER") {
    throw new ForbiddenException("Only the owner can add or change managers");
  }
}

async function findMember(
  db: Kysely<Database>,
  organisationId: string,
  memberId: string,
): Promise<TeamMember> {
  const member = (await team(db, organisationId)).find((m) => m.id === memberId);
  if (!member) throw new NotFoundException("Team member not found");
  return member;
}

async function team(db: Kysely<Database>, organisationId: string): Promise<TeamMember[]> {
  const members = await db
    .selectFrom("membership")
    .innerJoin("app_user", "app_user.id", "membership.user_id")
    .select((eb) => [
      "app_user.id",
      "app_user.name",
      "app_user.email",
      "app_user.phone",
      "membership.role",
      "membership.title",
      "membership.access",
      "membership.venue_ids as venueIds",
      eb
        .selectFrom("user_session")
        .select(sql<Date | null>`max(user_session.created_at)`.as("at"))
        .whereRef("user_session.user_id", "=", "app_user.id")
        .as("lastSignInAt"),
    ])
    .where("membership.organisation_id", "=", organisationId)
    .orderBy("membership.created_at")
    .execute();
  const invites = await db
    .selectFrom("member_invite")
    .select(["id", "name", "email", "role", "title", "access", "venue_ids as venueIds"])
    .where("organisation_id", "=", organisationId)
    .orderBy("created_at")
    .execute();
  return [
    ...members.map((m) => ({
      ...m,
      status: "ACTIVE" as const,
      lastSignInAt: m.lastSignInAt ? new Date(m.lastSignInAt).toISOString() : null,
    })),
    ...invites.map((i) => ({
      ...i,
      status: "INVITED" as const,
      phone: null,
      lastSignInAt: null,
    })),
  ];
}
