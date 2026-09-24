import { analysisCorpusNoun } from "@/lib/analysisScope";
import type { RepoReport } from "@/lib/reportTypes";

const BUCKETS = [
  ["ecmascript", "TS/JS"],
  ["python", "Python"],
  ["notebook", "Notebooks"],
] as const;

export interface LanguageSummaryView {
  /** "this pull request" or "the whole repository". */
  corpus: string;
  /** One segment per language that has files or source lines. */
  segments: string[];
  badges: string[];
}

/**
 * Whole-number percentages that add up to 100 (largest remainder).
 * Returns all zeros when the total is zero.
 */
export function roundedShares(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const shares = raw.map(Math.floor);
  let left = 100 - shares.reduce((sum, v) => sum + v, 0);
  const order = raw
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

export function buildLanguageSummaryView(report: RepoReport): LanguageSummaryView | null {
  if (report.analysisSkipped || !report.byLanguage) return null;

  const rows = BUCKETS.flatMap(([key, label]) => {
    const summary = report.byLanguage?.[key];
    if (!summary || (summary.files <= 0 && summary.sourceLOC <= 0)) return [];
    return [{ label, files: summary.files, sourceLOC: summary.sourceLOC }];
  });
  if (rows.length === 0) return null;

  const totalLoc = rows.reduce((sum, row) => sum + row.sourceLOC, 0);
  const shares = roundedShares(rows.map((row) => row.sourceLOC));
  const segments = rows.map((row, i) => {
    const files = `${row.files} file${row.files === 1 ? "" : "s"}`;
    if (totalLoc <= 0 || row.sourceLOC <= 0) return `${row.label} · ${files}`;
    const share = shares[i] > 0 ? `${shares[i]}%` : "under 1%";
    return `${row.label} ${share} of source lines · ${files}`;
  });

  const framework = report.framework;
  const badges: string[] = [];
  if (framework?.pythonBackend) badges.push(framework.pythonBackend);
  for (const tag of framework?.pythonStack ?? []) {
    if (!badges.includes(tag)) badges.push(tag);
  }
  const type = framework?.type;
  if (type && type !== framework?.pythonBackend && type !== "Python" && !badges.includes(type)) {
    badges.push(type);
  }

  return {
    corpus: analysisCorpusNoun(report),
    segments,
    badges,
  };
}
