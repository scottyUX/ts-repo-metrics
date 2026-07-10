export type NextAnalysisVersionInput = {
  /** Latest analysis commit for this user+repo (by analyzed_at), if any. */
  latestCommit: string | null;
  /** Version on that latest row, if any. */
  latestVersion: number | null;
  /** Max version across all rows for this user+repo. */
  maxVersion: number | null;
  /** Commit SHA of the analysis about to be saved. */
  newCommit: string | null;
};

export type NextAnalysisVersionResult = {
  version: number;
  /** True when commit matches the latest row — overwrite that version. */
  sameCommit: boolean;
};

/**
 * Read-side: highest numeric version from query rows, ignoring nulls.
 * Does not decide the next version — pass the result into nextAnalysisVersion.
 */
export function maxAnalysisVersion(
  rows: ReadonlyArray<{ version: number | null | undefined }>,
): number | null {
  let max: number | null = null;
  for (const row of rows) {
    if (row.version == null) continue;
    const n = Number(row.version);
    if (!Number.isFinite(n)) continue;
    if (max == null || n > max) max = n;
  }
  return max;
}

/**
 * Decide the analyses.version for a new save.
 * Same commit as latest → keep that version; otherwise max+1 (or 1).
 * Null commit on either side is treated as changed (bump).
 * Does not call maxAnalysisVersion — callers supply maxVersion.
 */
export function nextAnalysisVersion({
  latestCommit,
  latestVersion,
  maxVersion,
  newCommit,
}: NextAnalysisVersionInput): NextAnalysisVersionResult {
  const sameCommit =
    latestCommit != null &&
    newCommit != null &&
    latestCommit === newCommit;

  if (sameCommit) {
    return {
      version: latestVersion ?? maxVersion ?? 1,
      sameCommit: true,
    };
  }

  return {
    version: (maxVersion ?? 0) + 1,
    sameCommit: false,
  };
}
