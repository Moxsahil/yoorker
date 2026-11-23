import * as Sentry from "@sentry/nestjs";

export interface ErrorContext {
  requestId?: string;
  route?: string;
}

export interface ErrorReporter {
  report(error: unknown, context: ErrorContext): void;
}

export const ERROR_REPORTER = Symbol("ERROR_REPORTER");

export class SentryErrorReporter implements ErrorReporter {
  report(error: unknown, { requestId, route }: ErrorContext): void {
    Sentry.captureException(error, { tags: { request_id: requestId, route } });
  }
}
