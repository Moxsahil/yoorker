import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { Db } from "@yoorker/db";
import { sql } from "kysely";
import type { PgBoss } from "pg-boss";
import { DB } from "../database/database.module";
import { JOBS } from "../jobs/jobs.module";

export const CLEAN_OUTBOX = "outbox.clean";
const BATCH = 500;
const POLL_MS = 1_000;

@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(JOBS) private readonly boss: PgBoss,
  ) {}

  async onApplicationBootstrap() {
    this.timer = setInterval(() => void this.publish(), POLL_MS);
    await this.boss.createQueue(CLEAN_OUTBOX);
    await this.boss.schedule(CLEAN_OUTBOX, "30 3 * * *");
    await this.boss.work(CLEAN_OUTBOX, async () => {
      await this.clean();
    });
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async publish(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.transaction().execute(async (trx) => {
        const rows = await trx
          .selectFrom("outbox")
          .select(["id", "event", "payload"])
          .where("published_at", "is", null)
          .orderBy("id")
          .limit(BATCH)
          .forUpdate()
          .skipLocked()
          .execute();
        if (rows.length === 0) return 0;
        for (const row of rows) {
          const payload = JSON.stringify({ id: row.id, ...(row.payload as object) });
          await sql`SELECT pg_notify(${row.event}, ${payload})`.execute(trx);
        }
        await trx
          .updateTable("outbox")
          .set({ published_at: sql<Date>`now()` })
          .where(
            "id",
            "in",
            rows.map((r) => r.id),
          )
          .execute();
        return rows.length;
      });
    } catch (error) {
      this.logger.warn(`Couldn't publish events: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  async clean(): Promise<number> {
    const removed = await this.db
      .deleteFrom("outbox")
      .where("published_at", "<", sql<Date>`now() - interval '7 days'`)
      .executeTakeFirst();
    return Number(removed.numDeletedRows);
  }
}
