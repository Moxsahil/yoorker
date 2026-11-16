import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  googleSignInSchema,
  otpRequestSchema,
  otpVerifySchema,
  updateProfileSchema,
  type GoogleSignIn,
  type MeResponse,
  type OtpRequest,
  type OtpRequestResponse,
  type OtpVerify,
  type UpdateProfile,
} from "@yoorker/contracts";
import type { Request, Response } from "express";
import { CurrentActor, type Actor } from "../common/actor";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ENV, type Env } from "../config/env";
import { CurrentAuth, type AuthContext } from "./auth-context";
import { GoogleSignInService } from "./google-sign-in.service";
import { GOOGLE_TOKEN_VERIFIER, type GoogleTokenVerifier } from "./google-verifier";
import { MembershipService } from "./membership.service";
import { OtpService } from "./otp.service";
import { ProfileService } from "./profile.service";
import { Public } from "./public.decorator";
import { SESSION_COOKIE, SessionService, sessionCookieOptions } from "./session.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly memberships: MembershipService,
    private readonly googleSignIn: GoogleSignInService,
    private readonly profiles: ProfileService,
    @Inject(GOOGLE_TOKEN_VERIFIER) private readonly google: GoogleTokenVerifier,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post("google")
  @HttpCode(200)
  async signInWithGoogle(
    @Body(new ZodValidationPipe(googleSignInSchema)) body: GoogleSignIn,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const profile = await this.google.verify(body.idToken);
    if (!profile) throw new UnauthorizedException("Google sign-in failed. Please try again.");
    const userId = await this.googleSignIn.signIn(profile);
    return this.startSession(userId, req, res);
  }

  @Public()
  @Post("otp/request")
  @HttpCode(202)
  request(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest,
    @Req() req: Request,
  ): Promise<OtpRequestResponse> {
    this.requirePhoneOtp();
    return this.otp.request(body.phone, req.ip ?? null);
  }

  @Public()
  @Post("otp/verify")
  @HttpCode(200)
  async verify(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerify,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    this.requirePhoneOtp();
    const userId = await this.otp.verify(body.challengeId, body.code);
    return this.startSession(userId, req, res);
  }

  @Get("me")
  me(@CurrentAuth() auth: AuthContext): Promise<MeResponse> {
    return this.memberships.me(auth.userId);
  }

  @Patch("me")
  updateMe(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfile,
  ): Promise<MeResponse> {
    return this.profiles.update(actor, body);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    // Express 5 ignores maxAge here and sends an already-expired cookie.
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.env));
  }

  /** Phone OTP stays off in production until a real sender exists (ADR-0007). */
  private requirePhoneOtp(): void {
    if (!this.env.PHONE_OTP_ENABLED) {
      throw new ServiceUnavailableException(
        "Phone sign-in isn't available yet. Sign in with Google.",
      );
    }
  }

  private async startSession(userId: string, req: Request, res: Response): Promise<MeResponse> {
    const { token } = await this.sessions.create(userId, {
      userAgent: req.headers["user-agent"],
      ip: req.ip ?? null,
    });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.env));
    return this.memberships.me(userId);
  }
}
