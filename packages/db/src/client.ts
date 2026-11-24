import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema";

export type Db = Kysely<Database>;

export function createDb(
  connectionString: string,
  options: { max?: number; onConnectionError?: (error: Error) => void } = {},
): Db {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  // Without a listener, pg turns an error on an idle pooled connection (a database restart, a
  // failover) into an uncaught exception that stops the process. The pool replaces the
  // connection on its own.
  pool.on("error", options.onConnectionError ?? (() => {}));
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
