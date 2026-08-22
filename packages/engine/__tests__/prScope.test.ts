/**
 * Tests for PR changed-file filtering and allow-list analysis.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterChangedSourcePaths } from "../src/collect/githubPullRequest.js";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";
import { profileRepo } from "../src/collect/loc.js";
import { isAnalyzableSourcePath } from "../src/utils/constants.js";
import { sanitizeRefForKey } from "../src/utils/githubUrl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "sample-repo");

describe("filterChangedSourcePaths", () => {
  it("keeps added/modified/renamed TS files and drops removed and non-source", () => {
    const paths = filterChangedSourcePaths([
      { filename: "src/app.ts", status: "modified" },
      { filename: "src/gone.ts", status: "removed" },
      { filename: "README.md", status: "modified" },
      { filename: "src/New.tsx", status: "added" },
      { filename: "src/renamed.ts", status: "renamed" },
      { filename: "node_modules/pkg/index.ts", status: "added" },
    ]);
    expect(paths).toEqual(["src/app.ts", "src/New.tsx", "src/renamed.ts"]);
  });
});

describe("isAnalyzableSourcePath", () => {
  it("accepts ts/tsx and rejects ignored dirs", () => {
    expect(isAnalyzableSourcePath("src/foo.ts")).toBe(true);
    expect(isAnalyzableSourcePath("a.tsx")).toBe(true);
    expect(isAnalyzableSourcePath("src/foo.js")).toBe(false);
    expect(isAnalyzableSourcePath("dist/out.ts")).toBe(false);
    expect(isAnalyzableSourcePath("node_modules/x.ts")).toBe(false);
  });
});

describe("sanitizeRefForKey", () => {
  it("replaces slashes and odd characters", () => {
    expect(sanitizeRefForKey("feat/pr-scope")).toBe("feat-pr-scope");
    expect(sanitizeRefForKey("!!!")).toBe("ref");
  });
});

describe("analyzeRepo includePaths", () => {
  it("scopes profile and perFile to the allow-list", async () => {
    const full = await profileRepo(FIXTURE_PATH);
    expect(full.totalFiles).toBeGreaterThan(1);

    const report = await analyzeRepo(FIXTURE_PATH, {
      includePaths: ["index.ts"],
    });
    expect(report.profile.totalFiles).toBe(1);
    expect(report.filesAnalyzed).toBe(1);
    expect(report.perFile.map((f) => f.file)).toEqual(["index.ts"]);
  }, 30_000);

  it("returns a zeroed report when the allow-list has no matching files", async () => {
    const report = await analyzeRepo(FIXTURE_PATH, {
      includePaths: ["does-not-exist.ts"],
    });
    expect(report.filesAnalyzed).toBe(0);
    expect(report.profile.totalFiles).toBe(0);
    expect(report.totals.functions).toBe(0);
  }, 30_000);
});
