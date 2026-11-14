import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export interface AuthContext {
  userId: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/** `@CurrentAuth() auth: AuthContext` in a handler of a non-public route. */
export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.auth) throw new UnauthorizedException("Sign in required");
  return req.auth;
});
