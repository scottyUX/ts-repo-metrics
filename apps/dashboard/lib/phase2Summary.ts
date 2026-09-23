import type { FunctionDetail, RepoReport } from "@/lib/reportTypes";

export function hasPhase2Block(
  f: FunctionDetail,
): f is FunctionDetail & {
  halstead: NonNullable<FunctionDetail["halstead"]>;
  cognitiveComplexity: number;
  maintainabilityIndexGradAiNorm: number;
} {
  return (
    f.halstead != null &&
    typeof f.cognitiveComplexity === "number" &&
    typeof f.maintainabilityIndexGradAiNorm === "number"
  );
}

export type Phase2FunctionRow = { file: string; fn: FunctionDetail };

export function collectPhase2Rows(report: RepoReport): Phase2FunctionRow[] {
  const out: Phase2FunctionRow[] = [];
  for (const pf of report.perFile ?? []) {
    for (const fn of pf.functionMetrics ?? []) {
      out.push({ file: pf.file, fn });
    }
  }
  return out;
}

/** Aggregates over functions that have full Halstead, cognitive, and GRAD-AI MI_norm in this app. */
export type Phase2Summary = {
  halsteadVolMean: number;
  halsteadVolP90: number;
  cognitiveMean: number;
  cognitiveP90: number;
  miNormMean: number;
  miNormMedian: number;
  reactShare: number;
  /** Functions included in means (complete lexical + cognitive + MI_norm set). */
  functionsWithPhase2: number;
  /** All function rows from perFile (some rows may omit lexical metrics). */
  totalFunctionRows: number;
};

export function tryGetPhase2Summary(report: RepoReport): Phase2Summary | null {
  const rows = collectPhase2Rows(report);
  const fns = rows.map((r) => r.fn).filter(hasPhase2Block);
  if (fns.length === 0) return null;

  const vol = fns.map((f) => f.halstead.volume);
  const cog = fns.map((f) => f.cognitiveComplexity);
  const mi = fns.map((f) => f.maintainabilityIndexGradAiNorm);

  const mean = (a: number[]) =>
    a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
  const median = (a: number[]) => {
    const s = sorted(a);
    if (s.length === 0) return 0;
    const m = Math.floor((s.length - 1) / 2);
    return s.length % 2 ? s[m]! : (s[m]! + s[m + 1]!) / 2;
  };
  const p90 = (a: number[]) => {
    const s = sorted(a);
    if (s.length === 0) return 0;
    const idx = Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1);
    return s[idx]!;
  };

  const reactN = fns.filter((f) => f.isReactComponent).length;

  return {
    halsteadVolMean: mean(vol),
    halsteadVolP90: p90(vol),
    cognitiveMean: mean(cog),
    cognitiveP90: p90(cog),
    miNormMean: mean(mi),
    miNormMedian: median(mi),
    reactShare: reactN / fns.length,
    functionsWithPhase2: fns.length,
    totalFunctionRows: rows.length,
  };
}
