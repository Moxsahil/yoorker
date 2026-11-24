import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { BlocksModule } from "./blocks/blocks.module";
import { BookingsModule } from "./bookings/bookings.module";
import { LoggerModule } from "./common/logger.module";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { MembersModule } from "./members/members.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PhotosModule } from "./photos/photos.module";
import { PricingModule } from "./pricing/pricing.module";
import { ScheduleModule } from "./schedule/schedule.module";
import { SlotsModule } from "./slots/slots.module";
import { VenuesModule } from "./venues/venues.module";

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ObservabilityModule,
    DatabaseModule,
    AuthModule,
    VenuesModule,
    MembersModule,
    PhotosModule,
    ScheduleModule,
    PricingModule,
    BlocksModule,
    SlotsModule,
    BookingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
