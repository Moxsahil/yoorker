import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";

import type { Request } from "express";

export interface Actor {
  userId: string;
  requestId: string | null;
}

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.auth) throw new UnauthorizedException("Sign in required");
  const requestId = (req as Request & { id?: unknown }).id;
  return {
    userId: req.auth.userId,
    requestId: requestId === null ? null : String(requestId),
  };
});
