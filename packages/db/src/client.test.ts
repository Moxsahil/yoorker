import { sql } from "kysely";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb } from "./client";
import { startTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
});

afterAll(async () => {
  await t?.stop();
});

it("survives the database dropping an idle connection, and reports it", async () => {
  const errors: Error[] = [];
  const db = createDb(t.connectionString, { max: 1, onConnectionError: (e) => errors.push(e) });
  const before = await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(db);
  await sql`SELECT pg_terminate_backend(${before.rows[0]!.pid})`.execute(t.db);
  await expect.poll(() => errors.length).toBe(1);
  expect(errors[0]).toMatchObject({ code: "57P01" });

  const after = await sql<{ one: number }>`SELECT 1 AS one`.execute(db);
  expect(after.rows[0]!.one).toBe(1);
  await db.destroy();
});
