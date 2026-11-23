import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthModule } from "../auth/auth.module";
import { FeaturesController, MembersController } from "./members.controller";
import { MembersService } from "./members.service";

@Module({
  imports: [AuthModule],
  controllers: [MembersController, FeaturesController],
  providers: [MembersService, AuditService],
})
export class MembersModule {}
