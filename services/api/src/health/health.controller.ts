import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { HealthResponse } from "@yoorker/contracts";
import type { Db } from "@yoorker/db";
import { sql } from "kysely";
import { DB } from "../database/database.module";
import { Public } from "../auth/public.decorator";

@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await sql`SELECT 1`.execute(this.db);
    } catch {
      throw new ServiceUnavailableException({ status: "error", db: "unreachable" });
    }
    return { status: "ok", service: "api", db: "ok", time: new Date().toISOString() };
  }
}
