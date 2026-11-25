import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CLOCK, systemClock } from "../common/clock";
import { SlotsModule } from "../slots/slots.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { HoldExpiry } from "./hold-expiry";

@Module({
  imports: [AuthModule, SlotsModule],
  controllers: [BookingsController],
  providers: [BookingsService, HoldExpiry, { provide: CLOCK, useValue: systemClock }],
})
export class BookingsModule {}
