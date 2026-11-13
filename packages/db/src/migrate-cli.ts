import { fileURLToPath } from "node:url";
import { migrate } from "./migrate";

try {
  // Local dev: read the repo-root .env. Variables already set (CI, staging) win.
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // No .env file; use the real environment.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const { applied, skipped } = await migrate(url, undefined, (m) => console.log(m));
console.log(`${applied.length} applied, ${skipped.length} already up to date`);
