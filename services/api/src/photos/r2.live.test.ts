import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../config/env";
import { R2PhotoStorage } from "./r2-photo-storage";

// Talks to the real bucket, so it is skipped unless asked for. With the R2_* variables in .env:
//   cd services/api && R2_LIVE_TEST=1 pnpm vitest run src/photos/r2.live.test.ts
const live = process.env.R2_LIVE_TEST === "1";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

describe.runIf(live)("R2 bucket (live)", () => {
  it("uploads with a presigned URL, serves the file publicly, then deletes it", async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // Variables may already be in the environment.
    }
    const r2 = loadEnv().R2;
    if (!r2) throw new Error("Set the five R2_* variables in .env first");
    const storage = new R2PhotoStorage(r2);
    const key = `live-test/${randomUUID()}.png`;

    const wrongSize = await storage.presignUpload(key, "image/png", PNG.length + 1);
    const refused = await fetch(wrongSize.url, {
      method: "PUT",
      headers: wrongSize.headers,
      body: PNG,
    });
    expect(refused.ok).toBe(false);

    const upload = await storage.presignUpload(key, "image/png", PNG.length);
    const put = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: PNG });
    expect(put.status, await put.text()).toBe(200);
    expect(await storage.head(key)).toEqual({ size: PNG.length, contentType: "image/png" });

    const served = await fetch(storage.publicUrl(key));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");

    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
  }, 30_000);
});
