/**
 * Snapshot tests for full repository analysis output.
 *
 * Uses a fixture repo under fixtures/sample-repo/ to ensure the JSON
 * structure remains stable and the pipeline produces deterministic output.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";
import type { RepoReport } from "../src/types/report.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "sample-repo");

/**
 * Normalize volatile fields that vary across machines or runs.
 * - repoPath: absolute path differs per environment
 * - source: commit/branch vary by git state
 * - git: history-dependent (fixture may inherit parent .git); exclude from snapshot
 * - analysis_timestamp: varies each run
 */
function normalizeForSnapshot(report: RepoReport): unknown {
  const normalized = JSON.parse(JSON.stringify(report)) as RepoReport;
  normalized.repoPath = "<repoPath>";
  normalized.source = {
    type: report.source.type,
    url: report.source.url,
    commit: "<commit>",
    branch: "<branch>",
  };
  normalized.git = null;
  normalized.gitMetricsV2 = null;
  if (normalized.analysis_timestamp) {
    normalized.analysis_timestamp = "<timestamp>";
  }
  return normalized;
}

describe("analyzeRepo snapshot", () => {
  it("produces stable report structure for fixture repo", async () => {
    const report = await analyzeRepo(FIXTURE_PATH);
    const snapshot = normalizeForSnapshot(report);
    expect(snapshot).toMatchSnapshot();
  });
});
