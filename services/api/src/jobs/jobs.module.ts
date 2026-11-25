import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { ENV, type Env } from "../config/env";

export const JOBS = Symbol("JOBS");

@Injectable()
class JobsShutdown implements OnApplicationShutdown {
  constructor(@Inject(JOBS) private readonly boss: PgBoss) {}

  async onApplicationShutdown() {
    await this.boss.stop({ graceful: false, timeout: 5_000 });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: JOBS,
      inject: [ENV],
      useFactory: async (env: Env) => {
        const logger = new Logger("Jobs");
        // Supabase's session pooler allows few connections; the API's own pool needs most.
        const boss = new PgBoss({ connectionString: env.DATABASE_URL, max: 2 });
        boss.on("error", (error) => logger.warn(`Job queue error: ${error.message}`));
        await boss.start();
        return boss;
      },
    },
    JobsShutdown,
  ],
  exports: [JOBS],
})
export class JobsModule {}
