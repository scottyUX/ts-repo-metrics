import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "packages/engine/__tests__/**/*.test.ts",
      "apps/dashboard/__tests__/**/*.test.ts",
      // CLI-side code (batch mode) lives under src/ and had no test coverage;
      // its tests sit next to it rather than in the engine package.
      "src/**/__tests__/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/fixtures/**"],
    environment: "node",
    passWithNoTests: true,
    // analyzeRepo() spawns a real jscpd subprocess, so those tests take ~4.4s
    // each on an idle machine — 88% of vitest's 5s default. Under full-suite
    // parallelism they tipped over and failed intermittently (reproducible on a
    // clean tree, so pre-existing rather than introduced by any one change).
    // Raised for headroom; nothing about what is measured changes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./apps/dashboard"),
    },
  },
});
