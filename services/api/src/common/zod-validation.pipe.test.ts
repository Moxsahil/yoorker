import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

const pipe = new ZodValidationPipe(z.object({ name: z.string().min(1), courts: z.number().int() }));

describe("ZodValidationPipe", () => {
  it("returns the parsed value", () => {
    expect(pipe.transform({ name: "Sector 57 Turf", courts: 2 })).toEqual({
      name: "Sector 57 Turf",
      courts: 2,
    });
  });

  it("rejects invalid input with a 400 listing each issue", () => {
    try {
      pipe.transform({ name: "", courts: 1.5 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as { issues: { path: string }[] };
      expect(body.issues.map((i) => i.path)).toEqual(["name", "courts"]);
    }
  });
});
