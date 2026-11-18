// Imported first by main.ts, so Sentry starts before Nest, Express and pg are loaded.
import { loadEnv } from "./config/env";
import { initSentry } from "./observability/sentry";

try {
  // Local dev: `nest start` runs from services/api, so the repo-root .env is two levels up.
  // Variables already set (CI, staging) win.
  process.loadEnvFile("../../.env");
} catch {
  // No .env file; use the real environment.
}

try {
  initSentry(loadEnv());
} catch {
  // Invalid environment: ConfigModule reports it when the app boots.
}
