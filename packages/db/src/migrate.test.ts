import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { startTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
});

afterAll(async () => {
  await t?.stop();
});

describe("migrate", () => {
  it("installs btree_gist and postgis", async () => {
    const { rows } = await sql<{ extname: string }>`SELECT extname FROM pg_extension`.execute(t.db);
    expect(rows.map((r) => r.extname)).toEqual(expect.arrayContaining(["btree_gist", "postgis"]));
  });

  it("records each migration and skips it on the next run", async () => {
    const second = await migrate(t.connectionString);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain("0001_extensions.sql");
  });

  it("refuses a migration that changed after it was applied", async () => {
    await sql`UPDATE schema_migrations SET checksum = 'edited' WHERE name = '0001_extensions.sql'`.execute(
      t.db,
    );
    await expect(migrate(t.connectionString)).rejects.toThrow(/changed after it was applied/);
  });
});
