// #422: the re-capture panel ("Diffs saved before the PR-own-diff rule", #418) is off the Benchmark page,
// and its component stays in the code so it can be put back. Source checks only; nothing is rendered.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const BENCHMARK_PANEL = path.resolve(__dirname, "../components/cse115a/instructor/BenchmarkPanel.tsx");
const OLD_DIFF_RECAPTURE = path.resolve(__dirname, "../components/cse115a/instructor/OldDiffRecapture.tsx");

describe("Benchmark page without the re-capture panel (#422)", () => {
  it("BenchmarkPanel.tsx neither imports nor mounts OldDiffRecapture", () => {
    const source = readFileSync(BENCHMARK_PANEL, "utf8");
    expect(source).not.toContain("OldDiffRecapture");
    expect(source).not.toContain("./OldDiffRecapture");
    expect(source).not.toContain("/recapture");
    // The sections around it stay: the repo copies, then the newest rows.
    expect(source).toContain("<RepoCopies slug={slug} />\n\n      <section className=\"space-y-3\">");
  });

  it("OldDiffRecapture.tsx still exists and exports OldDiffRecapture", () => {
    expect(existsSync(OLD_DIFF_RECAPTURE)).toBe(true);
    const source = readFileSync(OLD_DIFF_RECAPTURE, "utf8");
    expect(source).toContain("export function OldDiffRecapture(");
    expect(source).toContain("/recapture`");
  });
});
