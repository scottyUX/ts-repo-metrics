/**
 * Browser sessionStorage for analysis reports when Supabase is not used.
 * v2 keys invalidate older caches that lack reactMetrics for TSX repos.
 */

import type { RepoReport } from "@/lib/reportTypes";

const LEGACY_PREFIX = "repo-metrics-report:";
const V2_PREFIX = "repo-metrics-report:v2:";

export function writeReportToSessionStorage(resultId: string, report: RepoReport): void {
  if (typeof sessionStorage === "undefined") return;
  const id = resultId.trim();
  try {
    sessionStorage.setItem(`${V2_PREFIX}${id}`, JSON.stringify(report));
    sessionStorage.removeItem(`${LEGACY_PREFIX}${id}`);
  } catch {
    // quota or private mode
  }
}

export function readReportFromSessionStorage(resultId: string): {
  report: RepoReport | null;
  droppedStaleCache: boolean;
} {
  if (typeof sessionStorage === "undefined") {
    return { report: null, droppedStaleCache: false };
  }
  const id = resultId.trim();

  const v2 = sessionStorage.getItem(`${V2_PREFIX}${id}`);
  if (v2) {
    try {
      return { report: JSON.parse(v2) as RepoReport, droppedStaleCache: false };
    } catch {
      return { report: null, droppedStaleCache: false };
    }
  }

  const legacy = sessionStorage.getItem(`${LEGACY_PREFIX}${id}`);
  if (!legacy) {
    return { report: null, droppedStaleCache: false };
  }

  try {
    const report = JSON.parse(legacy) as RepoReport;
    const jsxLike =
      (report.profile?.tsxFiles ?? 0) + (report.profile?.jsxFiles ?? 0);
    if (jsxLike > 0 && !report.reactMetrics) {
      sessionStorage.removeItem(`${LEGACY_PREFIX}${id}`);
      return { report: null, droppedStaleCache: true };
    }
    return { report, droppedStaleCache: false };
  } catch {
    return { report: null, droppedStaleCache: false };
  }
}
