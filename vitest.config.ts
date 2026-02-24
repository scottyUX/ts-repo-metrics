import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    include: ["packages/engine/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/fixtures/**"],
    environment: "node",
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
