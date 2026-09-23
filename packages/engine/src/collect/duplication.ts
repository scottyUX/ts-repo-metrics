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
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { IGNORE_PATTERNS } from "../utils/constants.js";
import type { DuplicationMetrics } from "../types/report.js";
import type { JscpdDuplicateJson } from "./weightedRedundancy.js";

export type { DuplicationMetrics } from "../types/report.js";
export type { JscpdDuplicateJson } from "./weightedRedundancy.js";

const execFileAsync = promisify(execFile);

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

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
 * Detect code duplication in a repository using jscpd.
 *
 * Runs jscpd with JSON reporter on TypeScript files, parses the result,
 * and returns structured metrics. Returns null if jscpd fails or is
 * unavailable rather than crashing the pipeline.
 *
 * @param repoPath - Absolute path to the repository root.
 * @param includePaths - Optional repo-relative allow-list (PR changed files).
 * @returns Metrics plus raw duplicate entries for Phase 3 SRS weighting, or null if analysis fails.
 */
export async function detectDuplication(
  repoPath: string,
  includePaths?: string[],
): Promise<DuplicationDetectionResult | null> {
  const jscpdBin = resolveJscpdBin();
  if (!jscpdBin) {
    console.error("[duplication] jscpd binary not found");
    return null;
  }

  // jscpd has no notebook format; an explicit .ipynb target would be read as text.
  includePaths = includePaths?.filter((p) => !p.endsWith(".ipynb"));

  if (includePaths && includePaths.length < 2) {
    return {
      metrics: { percentage: 0, duplicateLines: 0, cloneClusters: 0 },
      duplicates: [],
    };
  }

  // Repo-relative targets so ignore globs do not match ancestor dirs like `.cache`.
  const targets =
    includePaths && includePaths.length > 0
      ? includePaths.map((p) => {
          const abs = path.isAbsolute(p) ? p : path.resolve(repoPath, p);
          return path.relative(repoPath, abs).replace(/\\/g, "/");
        })
      : ["."];

  // The report goes to a temp folder, not the clone: a path built from repoPath
  // is user-controlled, and a report inside the repo would sit in the scan tree.
  let outputDir: string | undefined;
  try {
    outputDir = await mkdtemp(path.join(os.tmpdir(), "jscpd-"));
    await execFileAsync(
      jscpdBin,
      [
        ...targets,
        "--format",
        "typescript,tsx,javascript,jsx,python",
        "--reporters",
        "json",
        "--output",
        outputDir,
        "--ignore",
        IGNORE_PATTERNS.join(","),
        "--silent",
      ],
      { cwd: repoPath, timeout: 60_000 },
    );

    const reportPath = path.join(outputDir, "jscpd-report.json");
    let raw: string;
    try {
      raw = await readFile(reportPath, "utf8");
    } catch (err) {
      if (isEnoent(err)) {
        console.warn("[duplication] jscpd wrote no report");
        return null;
      }
      throw err;
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
    console.error("[duplication] jscpd failed:", err);
    return null;
  } finally {
    try {
      if (outputDir) await rm(outputDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
