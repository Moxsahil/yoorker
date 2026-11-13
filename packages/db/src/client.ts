import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema";

export type Db = Kysely<Database>;

export function createDb(connectionString: string, options: { max?: number } = {}): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: options.max ?? 10 }),
    }),
  });
}
