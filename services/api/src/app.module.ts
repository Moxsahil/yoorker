import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { LoggerModule } from "./common/logger.module";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { ObservabilityModule } from "./observability/observability.module";
import { VenuesModule } from "./venues/venues.module";

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ObservabilityModule,
    DatabaseModule,
    AuthModule,
    VenuesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
