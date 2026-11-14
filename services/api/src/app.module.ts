import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { LoggerModule } from "./common/logger.module";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { VenuesModule } from "./venues/venues.module";

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, AuthModule, VenuesModule],
  controllers: [HealthController],
})
export class AppModule {}
