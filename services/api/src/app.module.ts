import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { LoggerModule } from "./common/logger.module";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
