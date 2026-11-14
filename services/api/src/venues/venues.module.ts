import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthModule } from "../auth/auth.module";
import { CourtsController, OrganisationsController, VenuesController } from "./venues.controller";
import { VenuesService } from "./venues.service";

@Module({
  imports: [AuthModule],
  controllers: [OrganisationsController, VenuesController, CourtsController],
  providers: [VenuesService, AuditService],
})
export class VenuesModule {}
