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
 * Decide the analyses.version for a new save.
 * Same commit as latest → keep that version; otherwise max+1 (or 1).
 * Null commit on either side is treated as changed (bump).
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
