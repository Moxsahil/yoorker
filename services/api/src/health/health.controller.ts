import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { HealthResponse } from "@yoorker/contracts";
import type { Db } from "@yoorker/db";
import { sql } from "kysely";
import { Public } from "../auth/public.decorator";
import { ENV, type Env } from "../config/env";
import { DB } from "../database/database.module";

@Public()
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await sql`SELECT 1`.execute(this.db);
    } catch {
      throw new ServiceUnavailableException({ status: "error", db: "unreachable" });
    }
    return {
      status: "ok",
      service: "api",
      db: "ok",
      version: this.env.VERSION,
      time: new Date().toISOString(),
    };
  }
}
