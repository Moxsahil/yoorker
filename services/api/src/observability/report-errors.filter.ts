import { Catch, HttpException, Inject, type ArgumentsHost } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Request } from "express";
import { ERROR_REPORTER, type ErrorContext, type ErrorReporter } from "./error-reporter";

/**
 * Reports unexpected errors, then answers exactly as Nest would (500, generic message).
 * HttpExceptions are deliberate answers (400, 401, 404, 409, the /health 503) and are
 * not reported.
 */
@Catch()
export class ReportErrorsFilter extends BaseExceptionFilter {
  constructor(@Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (!(exception instanceof HttpException)) {
      this.reporter.report(exception, host.getType() === "http" ? requestContext(host) : {});
    }
    super.catch(exception, host);
  }
}

function requestContext(host: ArgumentsHost): ErrorContext {
  const req = host.switchToHttp().getRequest<Request & { id?: unknown }>();
  const pattern = (req.route as { path?: unknown } | undefined)?.path;
  return {
    requestId: typeof req.id === "string" ? req.id : undefined,
    route: typeof pattern === "string" ? `${req.method} ${pattern}` : req.method,
  };
}
