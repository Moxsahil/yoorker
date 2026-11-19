import { Module } from "@nestjs/common";
import { CLOCK, systemClock } from "../common/clock";
import { VenuesModule } from "../venues/venues.module";
import { SlotsController } from "./slots.controller";
import { SlotsService } from "./slots.service";

@Module({
  imports: [VenuesModule],
  controllers: [SlotsController],
  providers: [SlotsService, { provide: CLOCK, useValue: systemClock }],
  exports: [SlotsService],
})
export class SlotsModule {}
