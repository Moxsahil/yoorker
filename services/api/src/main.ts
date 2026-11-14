import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";
import { configureApp } from "./app-setup";
import { AppModule } from "./app.module";
import { ENV, type Env } from "./config/env";

try {
  // Local dev: `nest start` runs from services/api, so the repo-root .env is two levels up.
  // Variables already set (CI, staging) win.
  process.loadEnvFile("../../.env");
} catch {
  // No .env file; use the real environment.
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const env = app.get<Env>(ENV);
  configureApp(app, env);
  await app.listen(env.API_PORT);
}
void bootstrap();
