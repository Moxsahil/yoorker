import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { ENV, type Env } from "./config/env";

try {
  // Local dev: `nest start` runs from services/api, so the repo-root .env is two levels up.
  process.loadEnvFile("../../.env");
} catch {
  // No .env file; use the real environment.
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen(app.get<Env>(ENV).API_PORT);
}
void bootstrap();
