/**
 * Phase 3 — Structural Redundancy Score (SRS) from jscpd duplicate entries.
 *
 * Weights: 1.0 for exact match (100% similarity), 0.5 for (80%, 100%),
 * 0 for at or below 80%. Similarity is computed from the two file excerpts
 * (firstFile vs secondFile line ranges), not from the single merged fragment.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

/** One duplicate record from jscpd JSON reporter (v4). */
export interface JscpdDuplicateJson {
  format?: string;
  lines?: number;
  fragment?: string;
  firstFile?: {
    name: string;
    start: number;
    end: number;
  };
  secondFile?: {
    name: string;
    start: number;
    end: number;
  };
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Returns ratio in [0, 1]. */
export function levenshteinRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;
  const m = na.length;
  const n = nb.length;
  if (m === 0 || n === 0) return 0;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      const cost = na[i - 1] === nb[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  const dist = dp[n]!;
  const maxLen = Math.max(m, n);
  return 1 - dist / maxLen;
}

export function readLineRange(
  repoPath: string,
  relFile: string,
  startLine: number,
  endLine: number,
): string {
  const fullPath = path.isAbsolute(relFile)
    ? relFile
    : path.join(repoPath, relFile);
  const raw = readFileSync(fullPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const slice = lines.slice(Math.max(0, startLine - 1), endLine);
  return slice.join("\n");
}

function weightForSimilarity(sim: number): number {
  if (sim >= 1 - 1e-9) return 1.0;
  if (sim > 0.8 && sim < 1) return 0.5;
  return 0;
}

export interface WeightedRedundancyResult {
  /** Sum of (line mass × weight) across duplicate records. */
  weightedNumerator: number;
  /** SRS = weightedNumerator / sourceKLOC */
  srs: number;
  /** Lines counted at full weight (similarity ≥ 100%). */
  exactWeightedLines: number;
  /** Lines counted at half weight (80% < sim < 100%). */
  nearWeightedLines: number;
}

/**
 * @param sourceLOC - Non-test source lines (profile.sourceLOC)
 */
export function computeWeightedRedundancy(
  repoPath: string,
  duplicates: JscpdDuplicateJson[],
  sourceLOC: number,
): WeightedRedundancyResult {
  const sourceKLOC = sourceLOC / 1000;
  let weightedNumerator = 0;
  let exactWeightedLines = 0;
  let nearWeightedLines = 0;

  for (const dup of duplicates) {
    const lines = dup.lines ?? 0;
    if (lines <= 0) continue;

    let sim = 1;
    const f1 = dup.firstFile;
    const f2 = dup.secondFile;
    if (f1 && f2 && f1.name && f2.name) {
      try {
        const t1 = readLineRange(repoPath, f1.name, f1.start, f1.end);
        const t2 = readLineRange(repoPath, f2.name, f2.start, f2.end);
        sim = levenshteinRatio(t1, t2);
      } catch {
        sim = dup.fragment ? 1 : 0;
      }
    } else if (dup.fragment) {
      sim = 1;
    } else {
      continue;
    }

    const w = weightForSimilarity(sim);
    const contribution = lines * w;
    weightedNumerator += contribution;
    if (w === 1.0) exactWeightedLines += lines;
    else if (w === 0.5) nearWeightedLines += lines;
  }

  const srs = sourceKLOC > 0 ? weightedNumerator / sourceKLOC : 0;

  return {
    weightedNumerator: Math.round(weightedNumerator * 1000) / 1000,
    srs: Math.round(srs * 100000) / 100000,
    exactWeightedLines: Math.round(exactWeightedLines * 1000) / 1000,
    nearWeightedLines: Math.round(nearWeightedLines * 1000) / 1000,
  };
}
