import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC } from "./public.decorator";
import { SESSION_COOKIE, SessionService } from "./session.service";

/**
 * Registered globally: every route requires a live session unless marked @Public().
 * Forgetting a decorator therefore locks a route instead of leaving it open.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const auth = typeof token === "string" ? await this.sessions.resolve(token) : null;
    if (!auth) throw new UnauthorizedException("Sign in required");

    req.auth = auth;
    return true;
  }
}
