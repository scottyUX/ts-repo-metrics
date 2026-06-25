/**
 * End-to-end analysis for Python repositories.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "sample-py-repo");

describe("analyzeRepo (Python)", () => {
  it("analyzes .py files with function metrics", async () => {
    const report = await analyzeRepo(FIXTURE_PATH);

    expect(report.filesAnalyzed).toBeGreaterThan(0);
    expect(report.profile.pyFiles).toBeGreaterThan(0);
    expect(report.totals.functions).toBeGreaterThan(0);
    expect(report.functionMetricsSummary.totalFunctions).toBeGreaterThan(0);
    expect(report.complexity.max).toBeGreaterThanOrEqual(1);
  });

  it("does not emit reactMetrics for Python-only repos", async () => {
    const report = await analyzeRepo(FIXTURE_PATH);
    expect(report.reactMetrics).toBeUndefined();
  });

  it("detects print calls and empty except blocks", async () => {
    const report = await analyzeRepo(FIXTURE_PATH);
    expect(report.smells.consoleLogs).toBeGreaterThan(0);
    expect(report.smells.emptyCatchBlocks).toBeGreaterThan(0);
  });
});
