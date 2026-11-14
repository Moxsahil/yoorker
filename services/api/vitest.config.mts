import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // SWC instead of esbuild: Nest's dependency injection needs emitDecoratorMetadata.
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    testTimeout: 30_000,
    // The first run pulls the PostGIS image.
    hookTimeout: 180_000,
  },
});
