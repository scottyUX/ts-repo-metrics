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

  const jscpdBin = resolveJscpdBin();
  if (!jscpdBin) return null;

  try {
    await execFileAsync(jscpdBin, [
      repoPath,
      "--format", "typescript,tsx,javascript,jsx",
      "--reporters", "json",
      "--output", outputDir,
      "--ignore", "node_modules,dist,build,.next,out,coverage",
      "--silent",
    ], { timeout: 60_000 });

    const reportPath = path.join(outputDir, "jscpd-report.json");
    const raw = await readFile(reportPath, "utf8");
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
  } catch {
    return null;
  } finally {
    try {
      await rm(outputDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
