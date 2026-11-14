import { Inject, Injectable } from "@nestjs/common";
import type { AuditEntry } from "@yoorker/contracts";
import type { Database, Db } from "@yoorker/db";
import type { Kysely } from "kysely";
import type { Actor } from "../common/actor";
import { DB } from "../database/database.module";

export interface AuditRecord {
  organisationId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: object | null;
  after?: object | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(trx: Kysely<Database>, actor: Actor, entry: AuditRecord): Promise<void> {
    await trx
      .insertInto("audit_log")
      .values({
        organisation_id: entry.organisationId,
        actor_user_id: actor.userId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        request_id: actor.requestId,
      })
      .execute();
  }

  async listForOrganisation(organisationId: string, limit = 100): Promise<AuditEntry[]> {
    const rows = await this.db
      .selectFrom("audit_log")
      .select([
        "id",
        "action",
        "entity_type as entityType",
        "entity_id as entityId",
        "actor_user_id as actorUserId",
        "before",
        "after",
        "request_id as requestId",
        "created_at as createdAt",
      ])
      .where("organisation_id", "=", organisationId)
      .orderBy("id", "desc")
      .limit(limit)
      .execute();
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
}
