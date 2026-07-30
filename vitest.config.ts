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
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./apps/dashboard"),
    },
  },
});
