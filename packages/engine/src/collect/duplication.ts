/**
 * Code duplication detector using jscpd.
 *
 * Runs jscpd as a subprocess on the target repository, parses the JSON
 * output, and returns structured duplication metrics. Falls back to null
 * if jscpd fails or produces no output, so the rest of the pipeline is
 * never blocked by a duplication analysis failure.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";
import type { DuplicationMetrics } from "../types/report.js";
import type { JscpdDuplicateJson } from "./weightedRedundancy.js";

export type { DuplicationMetrics } from "../types/report.js";
export type { JscpdDuplicateJson } from "./weightedRedundancy.js";

const execFileAsync = promisify(execFile);

function resolveJscpdBin(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "node_modules", "jscpd", "bin", "jscpd");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export interface DuplicationDetectionResult {
  metrics: DuplicationMetrics;
  duplicates: JscpdDuplicateJson[];
}

/**
 * Directories excluded from duplication analysis.
 *
 * These MUST be globs. jscpd matches `--ignore` entries as glob patterns, so a
 * bare `node_modules` matches nothing at all — not a nested
 * `pkg/node_modules/**`, and not even a top-level `node_modules/**`. The bare
 * form previously in use meant jscpd walked the entire dependency tree: 10,487
 * files scanned for a repository with ~363 analyzable sources, reporting 42.18%
 * duplication that was really third-party code, or aborting out-of-memory on
 * larger trees. See research/validation/regeneration_gate.md.
 */
const IGNORE_GLOBS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/.jscpd-report/**",
];

/** Why jscpd produced no usable report. Each is logged distinctly. */
type JscpdFailure =
  | { kind: "not-installed" }
  | { kind: "timed-out"; timeoutMs: number }
  | { kind: "crashed"; code: number | null; signal: string | null; stderrTail: string }
  | { kind: "no-report" }
  | { kind: "unparsable-report"; message: string };

/**
 * Announce a duplication failure on stderr.
 *
 * `detectDuplication` still returns null so the pipeline is not blocked and no
 * false 0% is recorded, but a crash must not look like "jscpd is not installed",
 * and neither must look like a clean run that genuinely found no duplication.
 */
function logFailure(repoPath: string, failure: JscpdFailure): void {
  const prefix = `[duplication] ${repoPath}:`;
  switch (failure.kind) {
    case "not-installed":
      console.error(`${prefix} jscpd binary not found — duplication not measured.`);
      break;
    case "timed-out":
      console.error(
        `${prefix} jscpd exceeded its ${failure.timeoutMs}ms budget and was killed — ` +
          `duplication not measured. This usually means it walked far more files than ` +
          `expected; check the ignore globs.`,
      );
      break;
    case "crashed":
      console.error(
        `${prefix} jscpd exited abnormally (code=${failure.code ?? "null"}, ` +
          `signal=${failure.signal ?? "null"}) — duplication not measured. ` +
          `stderr tail: ${failure.stderrTail || "(empty)"}`,
      );
      break;
    case "no-report":
      console.error(
        `${prefix} jscpd completed but wrote no report file — duplication not measured.`,
      );
      break;
    case "unparsable-report":
      console.error(
        `${prefix} jscpd report could not be parsed (${failure.message}) — ` +
          `duplication not measured.`,
      );
      break;
  }
}

/**
 * Detect code duplication in a repository using jscpd.
 *
 * Runs jscpd with JSON reporter on TypeScript files, parses the result,
 * and returns structured metrics. Returns null if jscpd fails or is
 * unavailable rather than crashing the pipeline.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns Metrics plus raw duplicate entries for Phase 3 SRS weighting, or null if analysis fails.
 */
export async function detectDuplication(
  repoPath: string,
): Promise<DuplicationDetectionResult | null> {
  const outputDir = path.join(repoPath, ".jscpd-report");
  const TIMEOUT_MS = 60_000;

  const jscpdBin = resolveJscpdBin();
  if (!jscpdBin) {
    logFailure(repoPath, { kind: "not-installed" });
    return null;
  }

  try {
    try {
      await execFileAsync(jscpdBin, [
        repoPath,
        "--format", "typescript,tsx,javascript,jsx,python",
        "--reporters", "json",
        "--output", outputDir,
        "--ignore", IGNORE_GLOBS.join(","),
        "--silent",
      ], { timeout: TIMEOUT_MS });
    } catch (err) {
      // Separated from the report-reading try below so a process-level failure
      // is never reported as a bad report, and vice versa.
      const e = err as NodeJS.ErrnoException & {
        killed?: boolean;
        signal?: string | null;
        code?: number | string | null;
        stderr?: string;
      };
      const stderrTail = (e.stderr ?? "").trim().split("\n").slice(-3).join(" | ");
      if (e.killed || e.signal === "SIGTERM") {
        logFailure(repoPath, { kind: "timed-out", timeoutMs: TIMEOUT_MS });
      } else {
        logFailure(repoPath, {
          kind: "crashed",
          code: typeof e.code === "number" ? e.code : null,
          signal: e.signal ?? null,
          stderrTail,
        });
      }
      return null;
    }

    const reportPath = path.join(outputDir, "jscpd-report.json");
    let raw: string;
    try {
      raw = await readFile(reportPath, "utf8");
    } catch {
      logFailure(repoPath, { kind: "no-report" });
      return null;
    }

    const report = JSON.parse(raw) as {
      statistics?: {
        total?: {
          percentage?: number;
          duplicatedLines?: number;
        };
        clones?: number;
      };
      duplicates?: JscpdDuplicateJson[];
    };

    const stats = report.statistics?.total;
    const duplicates = Array.isArray(report.duplicates)
      ? report.duplicates
      : [];
    const cloneClusters =
      report.statistics?.clones ?? duplicates.length ?? 0;

    return {
      metrics: {
        percentage: Math.round((stats?.percentage ?? 0) * 10) / 10,
        duplicateLines: stats?.duplicatedLines ?? 0,
        cloneClusters,
      },
      duplicates,
    };
  } catch (err) {
    // Only reachable for a malformed report body now: process-level failures and
    // a missing report file are handled and logged above. Left non-silent so no
    // failure mode can regress into an unexplained null.
    logFailure(repoPath, {
      kind: "unparsable-report",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    try {
      await rm(outputDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
