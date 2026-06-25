/**
 * Per-symbol "verification" proxy: conventional test file pairing + identifier match
 * in paired test source. Not line coverage (Istanbul)—see report copy on the dashboard.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { isTestFilePath } from "../utils/constants.js";
import type {
  PerFileEntry,
  SymbolVerificationRisk,
  VerificationEvidence,
} from "../types/report.js";

export type { SymbolVerificationRisk, VerificationEvidence } from "../types/report.js";

const RISK_CC_CAP = 50;
const MAX_ROWS = 300;
/** Skip very short names that match too many substrings. */
const MIN_SYMBOL_NAME_LEN = 3;

/** First existing path wins (colocated tests preferred). */
export function pairedTestPathCandidates(relSource: string): string[] {
  const dir = path.dirname(relSource);
  const ext = path.extname(relSource).slice(1);
  const base = path.basename(relSource, path.extname(relSource));
  const norm = (p: string) => p.replace(/\\/g, "/");

  if (ext === "py") {
    return [
      norm(path.join(dir, `test_${base}.py`)),
      norm(path.join(dir, `${base}_test.py`)),
      norm(path.join(dir, "tests", `test_${base}.py`)),
      norm(path.join(dir, `${base}.test.py`)),
      norm(path.join(dir, `${base}.spec.py`)),
    ];
  }

  const sameDir = [
    norm(path.join(dir, `${base}.test.${ext}`)),
    norm(path.join(dir, `${base}.spec.${ext}`)),
  ];
  const underTests = [
    norm(path.join(dir, "__tests__", `${base}.${ext}`)),
    norm(path.join(dir, "__tests__", `${base}.test.${ext}`)),
    norm(path.join(dir, "__tests__", `${base}.spec.${ext}`)),
  ];
  return [...sameDir, ...underTests];
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True if `name` appears as a whole identifier in test source (word boundaries).
 */
export function symbolReferencedInSource(name: string, testSource: string): boolean {
  if (name.length < MIN_SYMBOL_NAME_LEN) return false;
  const re = new RegExp(`\\b${escapeRegExp(name)}\\b`);
  return re.test(testSource);
}

function computeRiskScore(cyclomaticComplexity: number, verificationScore: number): number {
  const cc = Math.min(cyclomaticComplexity, RISK_CC_CAP);
  return Math.round(cc * (1 - verificationScore) * 1000) / 1000;
}

async function readFirstExisting(
  repoPath: string,
  candidates: string[],
): Promise<{ rel: string; source: string } | null> {
  for (const rel of candidates) {
    const abs = path.join(repoPath, rel);
    try {
      const source = await readFile(abs, "utf8");
      return { rel, source };
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Build risk rows for non-test source files. Capped and sorted by descending `riskScore`.
 */
export async function computeSymbolVerificationRisks(
  repoPath: string,
  perFile: PerFileEntry[],
): Promise<SymbolVerificationRisk[]> {
  const rows: SymbolVerificationRisk[] = [];

  for (const pf of perFile) {
    if (isTestFilePath(pf.file)) continue;

    const candidates = pairedTestPathCandidates(pf.file);
    const found = await readFirstExisting(repoPath, candidates);
    const pairedTestPath = found?.rel;
    const testSource = found?.source;

    for (const fn of pf.functionMetrics) {
      const rawName = fn.name?.trim() ?? "";
      if (!rawName || rawName === "(anonymous)" || rawName.length < MIN_SYMBOL_NAME_LEN) {
        continue;
      }

      let verificationScore = 0;
      let evidence: VerificationEvidence = "none";

      if (pairedTestPath && testSource !== undefined) {
        evidence = "paired_file_only";
        verificationScore = 0.3;
        if (symbolReferencedInSource(rawName, testSource)) {
          verificationScore = 1;
          evidence = "referenced_in_test";
        }
      }

      rows.push({
        file: pf.file,
        name: rawName,
        startLine: fn.startLine,
        cyclomaticComplexity: fn.cyclomaticComplexity,
        verificationScore,
        evidence,
        pairedTestPath,
        riskScore: computeRiskScore(fn.cyclomaticComplexity, verificationScore),
      });
    }
  }

  rows.sort((a, b) => b.riskScore - a.riskScore || b.cyclomaticComplexity - a.cyclomaticComplexity);
  return rows.slice(0, MAX_ROWS);
}
