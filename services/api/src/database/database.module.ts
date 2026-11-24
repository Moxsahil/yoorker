import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createDb, type Db } from "@yoorker/db";
import { ENV, type Env } from "../config/env";

export const DB = Symbol("DB");

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ENV],
      useFactory: (env: Env) => {
        const logger = new Logger("Database");
        return createDb(env.DATABASE_URL, {
          onConnectionError: (error) =>
            logger.warn(`A database connection dropped and will be replaced: ${error.message}`),
        });
      },
    },
    DatabaseShutdown,
  ],
  exports: [DB],
})
export class DatabaseModule {}
