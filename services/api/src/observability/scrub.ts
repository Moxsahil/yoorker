import type { Breadcrumb, ErrorEvent } from "@sentry/nestjs";

// An Indian mobile number (98765 43210, +91 9876543210, 91-98765-43210), not part of a longer number.
const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-forwarded-for"]);

export function maskPhones(text: string): string {
  return text.replace(PHONE, "[phone]");
}

/**
 * Removes personal data before an event leaves the API (DPDP Act): the session cookie,
 * auth headers, request bodies (phone numbers, OTP codes, Google tokens) and any phone
 * number inside error messages, such as a Postgres "Key (phone)=(...)" detail.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (request.url) request.url = maskPhones(request.url);
    if (request.headers) {
      for (const name of Object.keys(request.headers)) {
        if (SENSITIVE_HEADERS.has(name.toLowerCase())) delete request.headers[name];
      }
    }
  }
  // Only ever an opaque user id; no email, name or IP address.
  event.user = event.user?.id === undefined ? undefined : { id: event.user.id };
  if (event.message) event.message = maskPhones(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = maskPhones(exception.value);
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.message) breadcrumb.message = maskPhones(breadcrumb.message);
  return breadcrumb;
}
