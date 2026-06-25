/**
 * End-to-end analysis for JavaScript / JSX repositories.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "sample-js-repo");

describe("analyzeRepo (JavaScript)", () => {
  it("analyzes .js and .jsx files with function metrics", async () => {
    const report = await analyzeRepo(FIXTURE_PATH);

    expect(report.filesAnalyzed).toBeGreaterThan(0);
    expect(report.totals.functions).toBeGreaterThan(0);
    expect(report.profile.jsFiles).toBeGreaterThan(0);
    expect(report.profile.jsxFiles).toBe(1);
    expect(report.functionMetricsSummary.totalFunctions).toBeGreaterThan(0);
    expect(report.complexity.max).toBeGreaterThanOrEqual(1);
  });

  it("emits reactMetrics when .jsx files are present", async () => {
    const report = await analyzeRepo(FIXTURE_PATH);
    expect(report.reactMetrics).toBeDefined();
    expect(report.reactMetrics!.summary.tsxFilesAnalyzed).toBeGreaterThan(0);
  });

  it("counts console.log as a smell in .js files", async () => {
    const report = await analyzeRepo(FIXTURE_PATH);
    expect(report.smells.consoleLogs).toBeGreaterThan(0);
  });
});
