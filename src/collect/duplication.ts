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
import { readFile, rm } from "node:fs/promises";
import type { DuplicationMetrics } from "../types/report.js";

export type { DuplicationMetrics } from "../types/report.js";

const execFileAsync = promisify(execFile);

/**
 * Detect code duplication in a repository using jscpd.
 *
 * Runs jscpd with JSON reporter on TypeScript files, parses the result,
 * and returns structured metrics. Returns null if jscpd fails or is
 * unavailable rather than crashing the pipeline.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns Duplication metrics, or null if analysis fails.
 */
export async function detectDuplication(
  repoPath: string,
): Promise<DuplicationMetrics | null> {
  const outputDir = path.join(repoPath, ".jscpd-report");

  try {
    const jscpdBin = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "..",
      "node_modules",
      ".bin",
      "jscpd",
    );

    await execFileAsync(jscpdBin, [
      repoPath,
      "--format", "typescript,tsx",
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
      duplicates?: unknown[];
    };

    const stats = report.statistics?.total;
    const cloneClusters =
      report.statistics?.clones ?? report.duplicates?.length ?? 0;

    return {
      percentage: Math.round((stats?.percentage ?? 0) * 10) / 10,
      duplicateLines: stats?.duplicatedLines ?? 0,
      cloneClusters,
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
