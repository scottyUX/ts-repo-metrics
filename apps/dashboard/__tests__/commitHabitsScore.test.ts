import { describe, expect, it } from "vitest";
import { computeCommitHabitsScore, computeCommitHabitsScoreForContributor } from "../lib/commitHabitsScore";
import type { ContributorActivity, RepoReport } from "../lib/reportTypes";

function minimalReport(over: Partial<RepoReport> = {}): RepoReport {
  const base: RepoReport = {
    repoPath: ".",
    source: { type: "git", url: "https://github.com/o/r", commit: "abc", branch: "main" },
    filesAnalyzed: 1,
    profile: {
      totalFiles: 1,
      tsFiles: 1,
      tsxFiles: 0,
      jsFiles: 0,
      jsxFiles: 0,
      testFiles: 0,
      totalLOC: 100,
      sourceLOC: 100,
      testLOC: 0,
    },
    totals: { functions: 1 },
    functionMetricsSummary: {
      totalFunctions: 1,
      averageLength: 10,
      medianLength: 10,
      maxNestingDepth: 2,
      longFunctionPercentage: 0,
    },
    complexity: { average: 5, max: 10, highComplexityFunctions: 0 },
    smells: {
      longFunctions: 0,
      deepNesting: 0,
      longParameterLists: 0,
      emptyCatchBlocks: 0,
      consoleLogs: 0,
    },
    perFile: [],
    ...over,
  };
  return base;
}

function minimalContributor(over: Partial<ContributorActivity> = {}): ContributorActivity {
  const base: ContributorActivity = {
    id: "a@example.com",
    displayName: "Author",
    authorEmail: "a@example.com",
    commitCount: 25,
    linesAdded: 500,
    linesDeleted: 100,
    testLineChurn: 0,
    sourceLineChurn: 600,
    testFilesTouched: 0,
    sourceFilesTouched: 4,
    commitStats: {
      medianCommitSize: 40,
      p90CommitSize: 90,
      pctOver500Loc: 8,
      pctOver1000Loc: 1,
    },
    burstStats: { burstCount: 1, burstRatio: 12 },
    entropy: {
      stdDevTimeBetweenCommits: 3_600_000,
      meanTimeBetweenCommits: 86_400_000,
    },
    refactorBehavior: { refactorCommitRatio: 0.12 },
    testCoupling: { pctCommitsTouchingTests: 15, testToFeatureCommitRatio: 0.25 },
    commitsPerWeek: 2.5,
    ...over,
  };
  return base;
}

describe("computeCommitHabitsScore", () => {
  it("returns critical-ish tier for no commits", () => {
    const r = computeCommitHabitsScore(
      minimalReport({
        git: {
          totalCommits: 0,
          medianCommitSize: 0,
          avgLinesPerCommit: 0,
          largeCommitRatio: 0,
          commitsPerWeek: 0,
        },
      }),
    );
    expect(r.score).toBe(0);
    expect(r.tier).toBe("critical");
    expect(r.worst.id).toBeTruthy();
    expect(r.drivers).toHaveLength(5);
  });

  it("handles missing gitMetricsV2 using git.largeCommitRatio", () => {
    const r = computeCommitHabitsScore(
      minimalReport({
        git: {
          totalCommits: 40,
          medianCommitSize: 50,
          avgLinesPerCommit: 40,
          largeCommitRatio: 0.5,
          commitsPerWeek: 2,
        },
        gitMetricsV2: undefined,
      }),
    );
    const batch = r.drivers.find((d) => d.id === "batch_size");
    expect(batch).toBeDefined();
    expect(batch!.score).toBeLessThan(60);
  });

  it("rewards healthy cadence and volume", () => {
    const r = computeCommitHabitsScore(
      minimalReport({
        git: {
          totalCommits: 120,
          medianCommitSize: 80,
          avgLinesPerCommit: 60,
          largeCommitRatio: 0.08,
          commitsPerWeek: 4,
        },
        gitMetricsV2: {
          commitStats: {
            medianCommitSize: 80,
            p90CommitSize: 120,
            pctOver500Loc: 5,
            pctOver1000Loc: 1,
          },
          burstStats: { burstCount: 1, burstRatio: 10 },
          entropy: { stdDevTimeBetweenCommits: 3600000, meanTimeBetweenCommits: 86_400_000 },
          churn: { topByModifications: [], topByLinesChanged: [] },
          refactorBehavior: { refactorCommitRatio: 0.15 },
          testCoupling: {
            pctCommitsTouchingTests: 20,
            testToFeatureCommitRatio: 0.3,
          },
          commitCalendar: null,
        },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(65);
    expect(["strong", "good"]).toContain(r.tier);
    expect(r.headline.length).toBeGreaterThan(10);
    expect(r.worst.advice.length).toBeGreaterThan(5);
  });

  it("penalizes high burst ratio", () => {
    const lowBurst = computeCommitHabitsScore(
      minimalReport({
        git: {
          totalCommits: 60,
          medianCommitSize: 40,
          avgLinesPerCommit: 35,
          largeCommitRatio: 0.1,
          commitsPerWeek: 3,
        },
        gitMetricsV2: {
          commitStats: {
            medianCommitSize: 40,
            p90CommitSize: 80,
            pctOver500Loc: 12,
            pctOver1000Loc: 2,
          },
          burstStats: { burstCount: 2, burstRatio: 25 },
          entropy: { stdDevTimeBetweenCommits: 7200000, meanTimeBetweenCommits: 86_400_000 },
          churn: { topByModifications: [], topByLinesChanged: [] },
          refactorBehavior: { refactorCommitRatio: 0.1 },
          testCoupling: {
            pctCommitsTouchingTests: 15,
            testToFeatureCommitRatio: 0.2,
          },
          commitCalendar: null,
        },
      }),
    );
    const highBurst = computeCommitHabitsScore(
      minimalReport({
        git: {
          totalCommits: 60,
          medianCommitSize: 40,
          avgLinesPerCommit: 35,
          largeCommitRatio: 0.1,
          commitsPerWeek: 3,
        },
        gitMetricsV2: {
          commitStats: {
            medianCommitSize: 40,
            p90CommitSize: 80,
            pctOver500Loc: 12,
            pctOver1000Loc: 2,
          },
          burstStats: { burstCount: 8, burstRatio: 92 },
          entropy: { stdDevTimeBetweenCommits: 7200000, meanTimeBetweenCommits: 86_400_000 },
          churn: { topByModifications: [], topByLinesChanged: [] },
          refactorBehavior: { refactorCommitRatio: 0.1 },
          testCoupling: {
            pctCommitsTouchingTests: 15,
            testToFeatureCommitRatio: 0.2,
          },
          commitCalendar: null,
        },
      }),
    );
    expect(highBurst.score).toBeLessThan(lowBurst.score);
    expect(highBurst.drivers.find((d) => d.id === "burstiness")!.score).toBeLessThan(
      lowBurst.drivers.find((d) => d.id === "burstiness")!.score,
    );
  });
});

describe("computeCommitHabitsScoreForContributor", () => {
  it("returns critical for zero commits", () => {
    const c = minimalContributor({ commitCount: 0, commitsPerWeek: 0 });
    const r = computeCommitHabitsScoreForContributor(c);
    expect(r.score).toBe(0);
    expect(r.tier).toBe("critical");
  });

  it("uses author commitCount, commitsPerWeek, and git v2 fields", () => {
    const r = computeCommitHabitsScoreForContributor(
      minimalContributor({
        commitCount: 80,
        commitsPerWeek: 4,
        commitStats: {
          medianCommitSize: 60,
          p90CommitSize: 100,
          pctOver500Loc: 4,
          pctOver1000Loc: 0,
        },
        burstStats: { burstCount: 1, burstRatio: 8 },
        entropy: {
          stdDevTimeBetweenCommits: 3_600_000,
          meanTimeBetweenCommits: 86_400_000,
        },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.drivers).toHaveLength(5);
    expect(r.drivers.find((d) => d.id === "cadence")!.score).toBeGreaterThan(50);
  });
});
