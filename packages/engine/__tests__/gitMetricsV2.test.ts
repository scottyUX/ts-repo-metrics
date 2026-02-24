/**
 * Unit tests for src/collect/gitMetricsV2.ts.
 *
 * Mocks simple-git to return fixture commit data for parsing and computation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractGitMetricsV2 } from "../src/collect/gitMetricsV2.js";

const mockRaw = vi.fn();
const mockCheckIsRepo = vi.fn();

vi.mock("simple-git", () => ({
  simpleGit: () => ({
    checkIsRepo: () => mockCheckIsRepo(),
    raw: (args: string[]) => mockRaw(args),
  }),
}));

describe("extractGitMetricsV2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckIsRepo.mockResolvedValue(true);
  });

  it("returns null for non-git repo", async () => {
    mockCheckIsRepo.mockResolvedValue(false);
    expect(await extractGitMetricsV2("/tmp/foo")).toBeNull();
  });

  it("returns null for empty history", async () => {
    mockRaw.mockResolvedValue("");
    expect(await extractGitMetricsV2("/tmp/repo")).toBeNull();
  });

  it("parses fixture and computes D1–D6 metrics", async () => {
    // Fixture: 5 commits, varying sizes, timestamps, and file paths
    // Commits spaced to create one burst (3 within 30 min) and one non-burst
    const t0 = 1700000000; // base
    const t1 = t0 + 5 * 60;   // +5 min
    const t2 = t0 + 10 * 60;  // +10 min (burst: t0,t1,t2 within 30 min)
    const t3 = t0 + 120 * 60; // +2 hrs (gap > 30 min)
    const t4 = t3 + 5 * 60;   // +5 min (second cluster of 2, no burst)
    const fixture = [
      `COMMIT_END
abc1
${t0}
feat: add foo
10	5	src/foo.ts
20	0	src/bar.test.ts`,
      `COMMIT_END
abc2
${t1}
fix: bar
5	2	src/foo.ts`,
      `COMMIT_END
abc3
${t2}
refactor: extract helper
100	50	src/baz.ts
0	0	src/foo.test.ts`,
      `COMMIT_END
abc4
${t3}
feat: big change
600	200	src/foo.ts`,
      `COMMIT_END
abc5
${t4}
chore: cleanup
2	1	src/foo.ts`,
    ].join("\n");

    mockRaw.mockResolvedValue(fixture);

    const result = await extractGitMetricsV2("/tmp/repo");
    expect(result).not.toBeNull();
    expect(result!).toMatchObject({
      commitStats: expect.objectContaining({
        medianCommitSize: expect.any(Number),
        p90CommitSize: expect.any(Number),
        pctOver500Loc: expect.any(Number),
        pctOver1000Loc: expect.any(Number),
      }),
      burstStats: expect.objectContaining({
        burstCount: expect.any(Number),
        burstRatio: expect.any(Number),
      }),
      entropy: expect.objectContaining({
        stdDevTimeBetweenCommits: expect.any(Number),
      }),
      churn: expect.objectContaining({
        topByModifications: expect.any(Array),
        topByLinesChanged: expect.any(Array),
      }),
      refactorBehavior: expect.objectContaining({
        refactorCommitRatio: expect.any(Number),
      }),
      testCoupling: expect.objectContaining({
        pctCommitsTouchingTests: expect.any(Number),
        testToFeatureCommitRatio: expect.any(Number),
      }),
    });

    // D1: sizes [35, 7, 150, 800, 3] -> 1/5 > 500, 0/5 > 1000
    expect(result!.commitStats.pctOver500Loc).toBe(20);
    expect(result!.commitStats.pctOver1000Loc).toBe(0);

    // D2: burst = commits t0,t1,t2 (3 within 30 min) -> 1 burst, 3 commits in burst, 60% ratio
    expect(result!.burstStats.burstCount).toBe(1);
    expect(result!.burstStats.burstRatio).toBe(60); // 3/5 * 100

    // D5: 2 commits touch test files (bar.test.ts, foo.test.ts)
    expect(result!.testCoupling.pctCommitsTouchingTests).toBe(40);

    // D6: 2 refactor commits (refactor, cleanup)
    expect(result!.refactorBehavior.refactorCommitRatio).toBe(40);

    // D4: src/foo.ts modified in 4 commits (most)
    expect(result!.churn.topByModifications[0]!.file).toBe("src/foo.ts");
    expect(result!.churn.topByModifications[0]!.modifications).toBe(4);
  });

  it("returns null on git error", async () => {
    mockRaw.mockRejectedValue(new Error("git failed"));
    expect(await extractGitMetricsV2("/tmp/repo")).toBeNull();
  });
});
