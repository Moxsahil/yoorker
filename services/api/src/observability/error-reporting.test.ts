import { Controller, Get, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Public } from "../auth/public.decorator";
import { createTestApp, type TestApp } from "../testing/test-app";

@Public()
@Controller("test-errors")
class ExplodingController {
  @Get("crash")
  crash(): never {
    throw new Error("something broke");
  }

  @Get("missing")
  missing(): never {
    throw new NotFoundException("No such venue");
  }
}

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ controllers: [ExplodingController] });
});

afterAll(async () => {
  await t?.close();
});

beforeEach(() => {
  t.errors.reports.length = 0;
});

describe("error reporting (TURF-106)", () => {
  it("reports an unexpected error with its request id and route", async () => {
    const res = await t
      .http()
      .get("/test-errors/crash")
      .set("x-request-id", "req-crash-1")
      .expect(500);
    // The caller still gets Nest's generic answer, never the error message.
    expect(res.body).toEqual({ statusCode: 500, message: "Internal server error" });

    expect(t.errors.reports).toHaveLength(1);
    const [report] = t.errors.reports;
    expect((report!.error as Error).message).toBe("something broke");
    expect(report!.context).toEqual({
      requestId: "req-crash-1",
      route: "GET /test-errors/crash",
    });
  });

  it("does not report deliberate HTTP errors", async () => {
    await t.http().get("/test-errors/missing").expect(404);
    await t.http().get("/auth/me").expect(401);
    await t.http().get("/no-such-route").expect(404);
    expect(t.errors.reports).toHaveLength(0);
  });
});
