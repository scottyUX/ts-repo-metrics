import { percentile } from "@/lib/distributionUtils";
import { normalizeRepoRelativePath } from "@/lib/filterSymbolVerificationRisksForContributor";
import type { DistributionMetrics, PerFileEntry, RepoReport } from "@/lib/reportTypes";
import {
  COMMIT_HABITS_SCOPE_TEAM,
  findContributorForScope,
  type CommitHabitsScopeId,
} from "@/lib/commitHabitsScopeMetrics";
import {
  UI_COMPLEXITY_CRITICAL_GT,
  UI_COMPLEXITY_HEALTHY_LT,
  UI_COMPLEXITY_HIGH_GT,
} from "@/lib/uiComplexityThresholds";

/** Matches `summarizeComplexity` in `packages/engine/src/extract/complexity.ts` (strictly > 10). */export const ENGINE_COMPLEXITY_HIGH_GT = 10;

/** Matches concentration math in `packages/engine/src/extract/distributions.ts`. */
const DISTRIBUTION_HIGH_GTE = 10;

const LONG_FUNCTION_LINES_GT = 50;

export type CodeQualityScopeMode = "team" | "contributor";

export interface CodeQualityScopeView {
  mode: CodeQualityScopeMode;
  contributorDisplayName: string | null;
  pathFilterActive: boolean;
  pathFilterMissing: boolean;
  contributorFilterYieldedNone: boolean;
  scopedPerFile: PerFileEntry[];
  totals: { functions: number };
  complexity: { average: number; max: number; highComplexityFunctions: number };
  functionMetricsSummary: RepoReport["functionMetricsSummary"];
  distributions: DistributionMetrics;
  /** Long functions (>50 lines) among paired rows in scope */
  longFunctionCount: number;
}

function emptyDistributions(): DistributionMetrics {
  return {
    p50_function_length: 0,
    p75_function_length: 0,
    p90_function_length: 0,
    p50_complexity: 0,
    p75_complexity: 0,
    p90_complexity: 0,
    percent_high_complexity_in_top_10_percent_files: 0,
  };
}

export function collectPairedFunctionRows(perFile: PerFileEntry[]): {
  complexities: number[];
  lengths: number[];
  nestings: number[];
} {
  const complexities: number[] = [];
  const lengths: number[] = [];
  const nestings: number[] = [];
  for (const pf of perFile) {
    for (let i = 0; i < pf.functionMetrics.length; i++) {
      const fm = pf.functionMetrics[i];
      const comp = pf.complexity[i];
      if (fm && comp) {
        complexities.push(comp.complexity);
        lengths.push(fm.lines);
        nestings.push(fm.maxNestingDepth);
      }
    }
  }
  return { complexities, lengths, nestings };
}

/**
 * UI bucket counts aligned with `HotspotTables` pairing (same row set).
 */
/**
 * Healthy (< 10), moderate (10–15), and high (> 15) partition every paired
 * function; critical (> 30) is a subset of high.
 */
export function countUiComplexityBucketsPaired(perFile: PerFileEntry[]): {
  highGtUi: number;
  criticalGtUi: number;
  moderateUi: number;
  healthyLtUi: number;
  totalPaired: number;
} {
  const { complexities } = collectPairedFunctionRows(perFile);
  let highGtUi = 0;
  let criticalGtUi = 0;
  let moderateUi = 0;
  let healthyLtUi = 0;
  for (const v of complexities) {
    if (v > UI_COMPLEXITY_CRITICAL_GT) criticalGtUi += 1;
    if (v > UI_COMPLEXITY_HIGH_GT) highGtUi += 1;
    else if (v < UI_COMPLEXITY_HEALTHY_LT) healthyLtUi += 1;
    else moderateUi += 1;
  }
  return {
    highGtUi,
    criticalGtUi,
    moderateUi,
    healthyLtUi,
    totalPaired: complexities.length,
  };
}

function medianSorted(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const mid = Math.floor(sortedAsc.length / 2);
  if (sortedAsc.length % 2 === 1) return sortedAsc[mid] ?? 0;
  return ((sortedAsc[mid - 1] ?? 0) + (sortedAsc[mid] ?? 0)) / 2;
}

function computeDistributions(
  perFile: PerFileEntry[],
  lengths: number[],
  complexities: number[],
): DistributionMetrics {
  if (lengths.length === 0) return emptyDistributions();

  const sortedLen = [...lengths].sort((a, b) => a - b);
  const sortedCx = [...complexities].sort((a, b) => a - b);

  let totalHighInScope = 0;
  for (const p of perFile) {
    for (const c of p.complexity ?? []) {
      if (c.complexity >= DISTRIBUTION_HIGH_GTE) totalHighInScope += 1;
    }
  }

  let percent_high_complexity_in_top_10_percent_files = 0;
  if (totalHighInScope > 0 && perFile.length > 0) {
    const fileSums = perFile.map((p) => ({
      file: p.file,
      total: (p.complexity ?? []).reduce((s, c) => s + c.complexity, 0),
      high: (p.complexity ?? []).filter((c) => c.complexity >= DISTRIBUTION_HIGH_GTE).length,
    }));
    fileSums.sort((a, b) => b.total - a.total);
    const topCount = Math.max(1, Math.ceil(fileSums.length * 0.1));
    const topFiles = new Set(fileSums.slice(0, topCount).map((f) => f.file));
    const highInTop = perFile
      .filter((p) => topFiles.has(p.file))
      .reduce(
        (sum, p) =>
          sum + (p.complexity ?? []).filter((c) => c.complexity >= DISTRIBUTION_HIGH_GTE).length,
        0,
      );
    percent_high_complexity_in_top_10_percent_files =
      Math.round((highInTop / totalHighInScope) * 1000) / 10;
  }

  return {
    p50_function_length: percentile(sortedLen, 50),
    p75_function_length: percentile(sortedLen, 75),
    p90_function_length: percentile(sortedLen, 90),
    p50_complexity: percentile(sortedCx, 50),
    p75_complexity: percentile(sortedCx, 75),
    p90_complexity: percentile(sortedCx, 90),
    percent_high_complexity_in_top_10_percent_files,
  };
}

function computeStructuralFromPerFile(perFile: PerFileEntry[]): Omit<
  CodeQualityScopeView,
  | "mode"
  | "contributorDisplayName"
  | "pathFilterActive"
  | "pathFilterMissing"
  | "contributorFilterYieldedNone"
  | "scopedPerFile"
> {
  const { complexities, lengths, nestings } = collectPairedFunctionRows(perFile);
  const n = complexities.length;
  if (n === 0) {
    return {
      totals: { functions: 0 },
      complexity: { average: 0, max: 0, highComplexityFunctions: 0 },
      functionMetricsSummary: {
        totalFunctions: 0,
        averageLength: 0,
        medianLength: 0,
        maxNestingDepth: 0,
        longFunctionPercentage: 0,
      },
      distributions: emptyDistributions(),
      longFunctionCount: 0,
    };
  }

  const totalCx = complexities.reduce((a, b) => a + b, 0);
  const average = Math.round((totalCx / n) * 10) / 10;
  const max = Math.max(...complexities);
  const highComplexityFunctions = complexities.filter((c) => c > ENGINE_COMPLEXITY_HIGH_GT).length;

  const sortedLen = [...lengths].sort((a, b) => a - b);
  const totalLines = lengths.reduce((a, b) => a + b, 0);
  const longFn = lengths.filter((l) => l > LONG_FUNCTION_LINES_GT).length;
  const longFunctionPercentage = Math.round((longFn / n) * 1000) / 10;
  const maxNestingDepth = Math.max(...nestings);

  return {
    totals: { functions: n },
    complexity: { average, max, highComplexityFunctions },
    functionMetricsSummary: {
      totalFunctions: n,
      averageLength: Math.round((totalLines / n) * 10) / 10,
      medianLength: Math.round(medianSorted(sortedLen) * 10) / 10,
      maxNestingDepth,
      longFunctionPercentage,
    },
    distributions: computeDistributions(perFile, lengths, complexities),
    longFunctionCount: longFn,
  };
}

export function resolveCodeQualityScope(
  report: RepoReport,
  scopeId: CommitHabitsScopeId,
): CodeQualityScopeView {
  const fullPerFile = report.perFile ?? [];
  const trimmed = String(scopeId ?? "").trim();
  const isTeam = scopeId === COMMIT_HABITS_SCOPE_TEAM || trimmed === "";

  if (isTeam) {
    const s = computeStructuralFromPerFile(fullPerFile);
    return {
      mode: "team",
      contributorDisplayName: null,
      pathFilterActive: false,
      pathFilterMissing: false,
      contributorFilterYieldedNone: false,
      scopedPerFile: fullPerFile,
      ...s,
    };
  }

  const c = findContributorForScope(report, scopeId);
  if (!c) {
    const s = computeStructuralFromPerFile(fullPerFile);
    return {
      mode: "team",
      contributorDisplayName: null,
      pathFilterActive: false,
      pathFilterMissing: false,
      contributorFilterYieldedNone: false,
      scopedPerFile: fullPerFile,
      ...s,
    };
  }

  const paths = c.sourcePathsTouchedList;
  if (!paths?.length) {
    const s = computeStructuralFromPerFile(fullPerFile);
    return {
      mode: "contributor",
      contributorDisplayName: c.displayName,
      pathFilterActive: false,
      pathFilterMissing: true,
      contributorFilterYieldedNone: false,
      scopedPerFile: fullPerFile,
      ...s,
    };
  }

  const set = new Set(paths.map((p) => normalizeRepoRelativePath(p)));
  const scoped = fullPerFile.filter((p) => set.has(normalizeRepoRelativePath(p.file)));

  if (scoped.length === 0) {
    const s = computeStructuralFromPerFile([]);
    return {
      mode: "contributor",
      contributorDisplayName: c.displayName,
      pathFilterActive: true,
      pathFilterMissing: false,
      contributorFilterYieldedNone: true,
      scopedPerFile: [],
      ...s,
    };
  }

  const s = computeStructuralFromPerFile(scoped);
  return {
    mode: "contributor",
    contributorDisplayName: c.displayName,
    pathFilterActive: true,
    pathFilterMissing: false,
    contributorFilterYieldedNone: false,
    scopedPerFile: scoped,
    ...s,
  };
}

export function buildCodeQualityDisplayReport(
  base: RepoReport,
  scope: CodeQualityScopeView,
): RepoReport {
  return {
    ...base,
    perFile: scope.scopedPerFile,
    totals: scope.totals,
    complexity: scope.complexity,
    functionMetricsSummary: scope.functionMetricsSummary,
    distributions: scope.distributions,
  };
}
