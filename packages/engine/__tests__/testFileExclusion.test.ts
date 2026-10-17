/**
 * Test files count toward test LOC but stay out of complexity metrics (#253).
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeRepo } from "../src/pipeline/analyzeRepo.js";
import type { RepoReport } from "../src/types/report.js";

const MATH_TS = `export function add(a: number, b: number): number {
  return a + b;
}

export function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
`;

const MATH_TEST_TS = `import { test, expect } from "vitest";
import { add, clamp } from "./math";

${Array.from(
  { length: 10 },
  (_, i) => `test("case ${i}", () => {
  console.log("case ${i}");
  expect(add(${i}, ${i})).toBe(${2 * i});
  expect(clamp(${i}, 0, 5)).toBe(${Math.min(i, 5)});
});
`,
).join("\n")}`;

const TEST_PY = `def test_add():
    assert 1 + 1 == 2
`;

function complexityView(r: RepoReport) {
  return {
    totals: r.totals,
    complexity: r.complexity,
    functionMetricsSummary: r.functionMetricsSummary,
    distributions: r.distributions,
    smells: r.smells,
    maintainability: r.maintainability,
    files: r.perFile.map((f) => f.file),
  };
}

async function withRepo(
  files: Record<string, string>,
  fn: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "test-exclusion-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await writeFile(path.join(root, rel), content);
    }
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("test file exclusion from complexity metrics", () => {
  it("adding a test file leaves complexity metrics unchanged", async () => {
    let sourceOnly: RepoReport | undefined;
    await withRepo({ "math.ts": MATH_TS }, async (root) => {
      sourceOnly = await analyzeRepo(root);
    });
    await withRepo({ "math.ts": MATH_TS, "math.test.ts": MATH_TEST_TS }, async (root) => {
      const withTests = await analyzeRepo(root);
      expect(complexityView(withTests)).toEqual(complexityView(sourceOnly!));
      expect(withTests.filesAnalyzed).toBe(1);
      // Symbol pairing reads test files from disk, so it still sees them.
      expect(withTests.symbolVerificationRisks.length).toBeGreaterThan(0);
      expect(
        withTests.symbolVerificationRisks.every((r) => r.evidence === "referenced_in_test"),
      ).toBe(true);
    });
  }, 30_000);

  it("still counts test files and test LOC", async () => {
    await withRepo({ "math.ts": MATH_TS, "math.test.ts": MATH_TEST_TS }, async (root) => {
      const report = await analyzeRepo(root);
      expect(report.profile.testFiles).toBe(1);
      expect(report.profile.testLOC).toBeGreaterThan(0);
      expect(report.byLanguage?.ecmascript?.testLOC).toBeGreaterThan(0);
      expect(report.byLanguage?.ecmascript?.functions).toBe(2);
      expect(report.byLanguage?.ecmascript?.smells.consoleLogs).toBe(0);
    });
  }, 30_000);

  it("reports no maintainability index when only test files changed", async () => {
    await withRepo({ "math.test.ts": MATH_TEST_TS }, async (root) => {
      const report = await analyzeRepo(root);
      expect(report.totals.functions).toBe(0);
      expect(report.maintainability).toBeNull();
    });
  });

  it("excludes pytest modules the same way", async () => {
    await withRepo({ "util.py": "def f(x):\n    return x\n", "test_util.py": TEST_PY }, async (root) => {
      const report = await analyzeRepo(root);
      expect(report.perFile.map((f) => f.file)).toEqual(["util.py"]);
      expect(report.totals.functions).toBe(1);
      expect(report.python?.typeHints.functions).toBe(1);
      expect(report.byLanguage?.python?.testLOC).toBeGreaterThan(0);
    });
  }, 30_000);
});
