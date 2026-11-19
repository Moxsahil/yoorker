import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { VenuesModule } from "../venues/venues.module";
import { BlocksController } from "./blocks.controller";
import { BlocksService } from "./blocks.service";

@Module({
  imports: [VenuesModule],
  controllers: [BlocksController],
  providers: [BlocksService, AuditService],
})
export class BlocksModule {}
