import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    // The first run pulls the PostGIS image, which can take a while.
    hookTimeout: 180_000,
  },
});
