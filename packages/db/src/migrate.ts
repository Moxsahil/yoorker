import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

// Any fixed number. Stops two deploys from migrating the same database at once.
const LOCK_ID = 7_001_001;
const FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies pending SQL files from `dir` in name order. Each file runs in its own
 * transaction and is recorded in schema_migrations with a checksum, so an
 * applied file that is later edited is refused instead of silently skipped.
 */
export async function migrate(
  connectionString: string,
  dir: string = MIGRATIONS_DIR,
  log: (message: string) => void = () => {},
): Promise<MigrateResult> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const badNames = files.filter((f) => !FILE_PATTERN.test(f));
  if (badNames.length > 0) {
    throw new Error(
      `Migration files must be named like 0002_create_users.sql: ${badNames.join(", ")}`,
    );
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations",
    );
    const done = new Map(rows.map((r) => [r.name, r.checksum]));
    const result: MigrateResult = { applied: [], skipped: [] };

    for (const file of files) {
      const sql = await readFile(join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = done.get(file);

      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(`${file} was changed after it was applied. Add a new migration instead.`);
        }
        result.skipped.push(file);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
          file,
          checksum,
        ]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
      result.applied.push(file);
      log(`applied ${file}`);
    }

    return result;
  } finally {
    // Ending the session also releases the advisory lock.
    await client.end();
  }
}
