import { describe, expect, it } from "vitest";
import { censusMarkdown, signals } from "@/lib/cse115a/benchmark/validation/census";

describe("signals", () => {
  it("spots a database from dependencies, CI services and test sources", () => {
    const s = signals({
      packageJson: JSON.stringify({ dependencies: { "drizzle-orm": "1", pg: "8" }, devDependencies: { vitest: "3" } }),
      workflows: "jobs:\n  test:\n    services:\n      postgres:\n        image: postgres:16\n",
      testSources: "assertTestDatabaseUrl(process.env.DATABASE_URL)",
    });
    expect(s.database).toEqual(["pg", "drizzle-orm", "ci-service", "tests-use-db"]);
    expect(s.browser).toEqual([]);
    expect(s.otherRunners).toEqual([]);
  });

  it("spots browsers and other runners, and tolerates a broken package.json", () => {
    expect(signals({ packageJson: JSON.stringify({ devDependencies: { jest: "29", "@playwright/test": "1" } }), workflows: "", testSources: "" }))
      .toEqual({ database: [], browser: ["@playwright/test"], otherRunners: ["jest"] });
    expect(signals({ packageJson: "{nope", workflows: "", testSources: "" })).toEqual({ database: [], browser: [], otherRunners: [] });
  });
});

describe("censusMarkdown", () => {
  it("renders one row per instance and counts per repository", () => {
    const md = censusMarkdown([
      { instance_id: "a-1", repo: "x/a", env: { supported: true, runners: ["node-test"], packageManager: "pnpm", packageDir: "server", installDir: "server", installCommand: "", testSteps: [], env: {}, dockerfile: "", image: "node:22-bookworm" }, signals: { database: ["pg"], browser: [], otherRunners: [] }, note: "" },
      { instance_id: "a-2", repo: "x/a", env: { supported: false, reason: "env_unsupported", detail: "jest" }, signals: { database: ["pg"], browser: [], otherRunners: ["jest"] }, note: "" },
      { instance_id: "b-1", repo: "x/b", env: { supported: true, runners: ["vitest"], packageManager: "npm", packageDir: "", installDir: "", installCommand: "", testSteps: [], env: {}, dockerfile: "", image: "node:22-bookworm" }, signals: { database: [], browser: [], otherRunners: [] }, note: "" },
    ]);
    expect(md).toContain("| a-1 | x/a | server | pnpm | node-test | node:22-bookworm | no | pg |  |  | supported |");
    expect(md).toContain("| a-2 | x/a |  |  |  |  |  | pg |  | jest | unsupported: jest |");
    expect(md).toContain("2 repositories, 3 rows.");
    expect(md).toContain("Need a database: 1. Browser tests: 0. Other runners: 0. Detector unsupported: 0.");
  });
});
