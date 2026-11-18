import * as Sentry from "@sentry/nestjs";

export interface ErrorContext {
  /** The x-request-id of the failed request, to find its log lines. */
  requestId?: string;
  /** Method and route pattern, e.g. "PATCH /venues/:id". */
  route?: string;
}

export interface ErrorReporter {
  report(error: unknown, context: ErrorContext): void;
}

export const ERROR_REPORTER = Symbol("ERROR_REPORTER");

/** Sends to Sentry; does nothing when Sentry was not started (no SENTRY_DSN). */
export class SentryErrorReporter implements ErrorReporter {
  report(error: unknown, { requestId, route }: ErrorContext): void {
    Sentry.captureException(error, { tags: { request_id: requestId, route } });
  }
}
