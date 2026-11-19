import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MAX_BLOCK_DAYS,
  type Block,
  type CreateBlocks,
  type ListBlocksQuery,
} from "@yoorker/contracts";
import type { BlockReason, Database, Db, MemberRole } from "@yoorker/db";
import { sql, type Kysely } from "kysely";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../common/actor";
import { DB } from "../database/database.module";
import { localDateTimeToUtc, localToUtc, utcToLocal } from "../schedule/local-time";
import { VenuesService } from "../venues/venues.service";

const ANY_MEMBER: readonly MemberRole[] = ["OWNER", "MANAGER", "STAFF"];
const MANAGERS: readonly MemberRole[] = ["OWNER", "MANAGER"];
const DAY_MS = 24 * 60 * 60 * 1000;

interface BlockRow {
  id: string;
  courtId: string;
  startsAt: Date;
  endsAt: Date;
  reason: BlockReason;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
}

function selectBlocks(db: Kysely<Database>) {
  return db
    .selectFrom("blackout")
    .select([
      "blackout.id",
      "blackout.court_id as courtId",
      sql<Date>`lower(blackout.during)`.as("startsAt"),
      sql<Date>`upper(blackout.during)`.as("endsAt"),
      "blackout.reason",
      "blackout.note",
      "blackout.created_by as createdBy",
      "blackout.created_at as createdAt",
    ]);
}

function toBlock(row: BlockRow, timeZone: string): Block {
  return {
    id: row.id,
    courtId: row.courtId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    from: utcToLocal(row.startsAt, timeZone),
    to: utcToLocal(row.endsAt, timeZone),
    reason: row.reason,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class BlocksService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly venues: VenuesService,
    private readonly audit: AuditService,
  ) {}

  /** Blocks the chosen courts of a venue, or all its active courts, for one stretch of time. */
  async createBlocks(actor: Actor, venueId: string, input: CreateBlocks): Promise<Block[]> {
    // Staff block courts too: rain, a broken net, a match running late.
    const venue = await this.venues.getVenue(actor, venueId, ANY_MEMBER);
    const startsAt = localDateTimeToUtc(input.from, venue.timezone);
    const endsAt = localDateTimeToUtc(input.to, venue.timezone);
    if (endsAt.getTime() - startsAt.getTime() > MAX_BLOCK_DAYS * DAY_MS) {
      throw new BadRequestException(`A block can last at most ${MAX_BLOCK_DAYS} days`);
    }

    let courts = this.db
      .selectFrom("court")
      .select(["id", "name"])
      .where("venue_id", "=", venueId)
      .orderBy("name");
    courts = input.allCourts
      ? courts.where("is_active", "=", true)
      : courts.where("id", "in", input.courtIds!);
    const targets = await courts.execute();
    if (input.courtIds && targets.length !== new Set(input.courtIds).size) {
      throw new BadRequestException("Some of those courts aren't at this venue");
    }
    if (targets.length === 0) throw new BadRequestException("This venue has no active courts");

    const during = sql<string>`tstzrange(${startsAt}, ${endsAt}, '[)')`;
    const clashes = await this.db
      .selectFrom("blackout")
      .innerJoin("court", "court.id", "blackout.court_id")
      .select("court.name")
      .where(
        "blackout.court_id",
        "in",
        targets.map((c) => c.id),
      )
      .where(sql<boolean>`blackout.during && ${during}`)
      .orderBy("court.name")
      .execute();
    if (clashes.length > 0) {
      const names = [...new Set(clashes.map((c) => c.name))].join(", ");
      throw new ConflictException(`Already blocked at that time: ${names}`);
    }

    try {
      return await this.db.transaction().execute(async (trx) => {
        const blocks: Block[] = [];
        for (const court of targets) {
          const { id } = await trx
            .insertInto("blackout")
            .values({
              court_id: court.id,
              during,
              reason: input.reason,
              note: input.note,
              created_by: actor.userId,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          const block = toBlock(
            await selectBlocks(trx).where("blackout.id", "=", id).executeTakeFirstOrThrow(),
            venue.timezone,
          );
          await this.audit.record(trx, actor, {
            organisationId: venue.organisationId,
            action: "block.create",
            entityType: "blackout",
            entityId: id,
            after: block,
          });
          blocks.push(block);
        }
        return blocks;
      });
    } catch (err) {
      // Another request blocked the same time a moment ago.
      if ((err as { constraint?: string }).constraint === "blackout_no_overlap") {
        throw new ConflictException("Already blocked at that time");
      }
      throw err;
    }
  }

  /** Blocks that touch the local dates from `from` up to (not including) `to`. */
  async listBlocks(actor: Actor, courtId: string, query: ListBlocksQuery): Promise<Block[]> {
    const court = await this.venues.getCourtAccess(actor, courtId, ANY_MEMBER);
    const from = localToUtc(query.from, 0, court.timezone);
    const to = localToUtc(query.to, 0, court.timezone);
    if (to.getTime() - from.getTime() > 62 * DAY_MS) {
      throw new BadRequestException("Ask for at most 62 days at a time");
    }
    const rows = await selectBlocks(this.db)
      .where("blackout.court_id", "=", courtId)
      .where(sql<boolean>`blackout.during && tstzrange(${from}, ${to}, '[)')`)
      .orderBy(sql`lower(blackout.during)`)
      .execute();
    return rows.map((row) => toBlock(row, court.timezone));
  }

  /** Anyone may remove their own block; owners and managers may remove any block. */
  async removeBlock(actor: Actor, blockId: string): Promise<void> {
    const row = await selectBlocks(this.db).where("blackout.id", "=", blockId).executeTakeFirst();
    if (!row) throw new NotFoundException("Block not found");
    const notFound = (err: unknown) => {
      throw err instanceof NotFoundException ? new NotFoundException("Block not found") : err;
    };
    const court = await this.venues.getCourtAccess(actor, row.courtId, ANY_MEMBER).catch(notFound);
    if (row.createdBy !== actor.userId) {
      await this.venues.getCourtAccess(actor, row.courtId, MANAGERS);
    }
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("blackout").where("id", "=", blockId).execute();
      await this.audit.record(trx, actor, {
        organisationId: court.organisationId,
        action: "block.delete",
        entityType: "blackout",
        entityId: blockId,
        before: toBlock(row, court.timezone),
      });
    });
  }
}
