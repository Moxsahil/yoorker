import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
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
    { provide: DB, inject: [ENV], useFactory: (env: Env) => createDb(env.DATABASE_URL) },
    DatabaseShutdown,
  ],
  exports: [DB],
})
export class DatabaseModule {}
