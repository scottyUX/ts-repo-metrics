import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "__tests__/fixtures/**"],
    environment: "node",
    passWithNoTests: true,
  },
});
