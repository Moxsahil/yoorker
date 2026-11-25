import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import type { Db } from "@yoorker/db";
import type { PgBoss } from "pg-boss";
import { CLOCK, type Clock } from "../common/clock";
import { DB } from "../database/database.module";
import { JOBS } from "../jobs/jobs.module";

export const SWEEP_HOLDS = "hold.sweep";

@Injectable()
export class HoldExpiry implements OnApplicationBootstrap {
  private readonly logger = new Logger(HoldExpiry.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(JOBS) private readonly boss: PgBoss,
  ) {}

  async onApplicationBootstrap() {
    await this.boss.createQueue(SWEEP_HOLDS);
    await this.boss.schedule(SWEEP_HOLDS, "* * * * *");
    await this.boss.work(SWEEP_HOLDS, async () => {
      await this.sweep();
    });
  }

  async sweep(): Promise<number> {
    const expired = await this.db
      .updateTable("booking")
      .set({ status: "EXPIRED" })
      .where("status", "=", "HELD")
      .where("hold_expires_at", "<=", this.clock.now())
      .returning("id")
      .execute();
    if (expired.length > 0) this.logger.log(`Expired ${expired.length} unpaid holds`);
    return expired.length;
  }
}
