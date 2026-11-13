import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createDb, type Db } from "./client";
import { migrate } from "./migrate";

// Same image as docker-compose.yml, so tests run against what dev runs.
export const POSTGIS_IMAGE = "postgis/postgis:16-3.4";

export interface TestDatabase {
  db: Db;
  connectionString: string;
  stop(): Promise<void>;
}

/** Starts a throwaway PostGIS container with every migration applied. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(POSTGIS_IMAGE).start();
  const connectionString = container.getConnectionUri();
  await migrate(connectionString);
  // A larger pool so concurrency tests (TURF-304) can fire many requests at once.
  const db = createDb(connectionString, { max: 20 });

  return {
    db,
    connectionString,
    async stop() {
      await db.destroy();
      await container.stop();
    },
  };
}
