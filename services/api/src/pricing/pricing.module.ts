import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { VenuesModule } from "../venues/venues.module";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";

@Module({
  imports: [VenuesModule],
  controllers: [PricingController],
  providers: [PricingService, AuditService],
})
export class PricingModule {}
