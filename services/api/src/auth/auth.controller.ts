import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import {
  otpRequestSchema,
  otpVerifySchema,
  type MeResponse,
  type OtpRequest,
  type OtpRequestResponse,
  type OtpVerify,
} from "@yoorker/contracts";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ENV, type Env } from "../config/env";
import { CurrentAuth, type AuthContext } from "./auth-context";
import { MembershipService } from "./membership.service";
import { OtpService } from "./otp.service";
import { Public } from "./public.decorator";
import { SESSION_COOKIE, SessionService, sessionCookieOptions } from "./session.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly memberships: MembershipService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post("otp/request")
  @HttpCode(202)
  request(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest,
    @Req() req: Request,
  ): Promise<OtpRequestResponse> {
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
    const userId = await this.otp.verify(body.challengeId, body.code);
    const { token } = await this.sessions.create(userId, {
      userAgent: req.headers["user-agent"],
      ip: req.ip ?? null,
    });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.env));
    return this.memberships.me(userId);
  }

  @Get("me")
  me(@CurrentAuth() auth: AuthContext): Promise<MeResponse> {
    return this.memberships.me(auth.userId);
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
}
