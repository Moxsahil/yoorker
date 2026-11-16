import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuditService } from "../audit/audit.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { GoogleSignInService } from "./google-sign-in.service";
import { GOOGLE_TOKEN_VERIFIER, GoogleAuthLibraryVerifier } from "./google-verifier";
import { MembershipService } from "./membership.service";
import { LogOtpSender, OTP_SENDER } from "./otp-sender";
import { OtpService } from "./otp.service";
import { ProfileService } from "./profile.service";
import { SessionService } from "./session.service";

@Module({
  controllers: [AuthController],
  providers: [
    OtpService,
    SessionService,
    MembershipService,
    GoogleSignInService,
    ProfileService,
    AuditService,
    { provide: OTP_SENDER, useClass: LogOtpSender },
    { provide: GOOGLE_TOKEN_VERIFIER, useClass: GoogleAuthLibraryVerifier },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService, MembershipService],
})
export class AuthModule {}
