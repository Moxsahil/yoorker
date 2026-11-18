import * as Sentry from "@sentry/nestjs";
import type { Env } from "../config/env";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

/** Starts Sentry when SENTRY_DSN is set. Returns whether it started. */
export function initSentry(
  env: Pick<Env, "SENTRY_DSN" | "SENTRY_ENVIRONMENT" | "VERSION">,
): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.VERSION,
    // Errors only: no tracesSampleRate, so performance tracing stays off (free plan quota).
    // Collect no personal data (DPDP Act); scrubEvent removes anything that slips through.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      httpHeaders: {
        request: { deny: ["authorization", "cookie", "x-forwarded-for"] },
        response: false,
      },
    },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  return true;
}
