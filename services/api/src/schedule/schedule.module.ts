import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { VenuesModule } from "../venues/venues.module";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";

@Module({
  imports: [VenuesModule],
  controllers: [ScheduleController],
  providers: [ScheduleService, AuditService],
})
export class ScheduleModule {}
