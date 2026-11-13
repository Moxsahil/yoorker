import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { MembershipService } from "./membership.service";
import { LogOtpSender, OTP_SENDER } from "./otp-sender";
import { OtpService } from "./otp.service";
import { SessionService } from "./session.service";

@Module({
  controllers: [AuthController],
  providers: [
    OtpService,
    SessionService,
    MembershipService,
    { provide: OTP_SENDER, useClass: LogOtpSender },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService, MembershipService],
})
export class AuthModule {}
