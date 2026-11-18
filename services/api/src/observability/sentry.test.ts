import type { ErrorEvent } from "@sentry/nestjs";
import { describe, expect, it } from "vitest";
import { maskPhones, scrubBreadcrumb, scrubEvent } from "./scrub";
import { initSentry } from "./sentry";

describe("initSentry", () => {
  it("stays off without a DSN", () => {
    expect(initSentry({ SENTRY_DSN: undefined, SENTRY_ENVIRONMENT: "test", VERSION: "dev" })).toBe(
      false,
    );
  });
});

describe("maskPhones", () => {
  it("masks Indian mobile numbers in any common form", () => {
    expect(maskPhones("Key (phone)=(+919876543210) already exists.")).toBe(
      "Key (phone)=([phone]) already exists.",
    );
    expect(maskPhones("call 9876543210 or +91 98765 43210")).toBe("call [phone] or [phone]");
    expect(maskPhones("91-98765-43210")).toBe("[phone]");
  });

  it("leaves other numbers alone", () => {
    expect(maskPhones("booking 12345 for 1234567890123 paise")).toBe(
      "booking 12345 for 1234567890123 paise",
    );
  });
});

describe("scrubEvent", () => {
  it("removes cookies, auth headers, bodies and personal user fields", () => {
    const event = scrubEvent({
      type: undefined,
      message: "OTP for 9876543210 failed",
      request: {
        url: "https://staging-api.yoorker.com/auth/otp/verify",
        method: "POST",
        cookies: { yk_session: "secret" },
        data: { phone: "9876543210", code: "123456" },
        query_string: "phone=9876543210",
        headers: {
          Cookie: "yk_session=secret",
          authorization: "Bearer x",
          "x-forwarded-for": "203.0.113.7",
          "user-agent": "test",
        },
      },
      user: { id: "user-1", email: "a@example.com", ip_address: "203.0.113.7" },
      exception: { values: [{ type: "Error", value: "duplicate +919876543210" }] },
      breadcrumbs: [{ message: "sent to 9876543210" }],
    } satisfies ErrorEvent);

    expect(event.request).toEqual({
      url: "https://staging-api.yoorker.com/auth/otp/verify",
      method: "POST",
      headers: { "user-agent": "test" },
    });
    expect(event.user).toEqual({ id: "user-1" });
    expect(event.message).toBe("OTP for [phone] failed");
    expect(event.exception?.values?.[0]?.value).toBe("duplicate [phone]");
    expect(event.breadcrumbs?.[0]?.message).toBe("sent to [phone]");
  });

  it("drops the user when there is no id", () => {
    expect(
      scrubEvent({ type: undefined, user: { ip_address: "203.0.113.7" } }).user,
    ).toBeUndefined();
  });

  it("masks breadcrumb messages", () => {
    expect(scrubBreadcrumb({ message: "+919876543210" }).message).toBe("[phone]");
  });
});
