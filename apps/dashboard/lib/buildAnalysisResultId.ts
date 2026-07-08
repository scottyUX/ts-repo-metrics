import { randomUUID } from "node:crypto";

export type BuildAnalysisResultIdInput = {
  userId: string;
  owner: string;
  repo: string;
  commitSha: string | null;
};

/** Build a per-user analysis result_id: {userId}-{owner}-{repo}-{commitSuffix}. */
export function buildAnalysisResultId({
  userId,
  owner,
  repo,
  commitSha,
}: BuildAnalysisResultIdInput): string {
  const suffix = commitSha
    ? commitSha.slice(0, 12)
    : randomUUID().replace(/-/g, "").slice(0, 12);
  return `${userId}-${owner}-${repo}-${suffix}`;
}

export type AnalysisResultIdLookupOptions = {
  /**
   * When true, try the signed-in user's scoped id before a legacy shared id.
   * Use for AI usage CSV persistence so uploads stay on per-user analysis rows.
   */
  preferUserScope?: boolean;
};

/**
 * Candidate result_ids to try when resolving a stored analysis row.
 * Supports legacy URLs (owner-repo-commit) for signed-in users who re-analyzed
 * after the per-user result_id change.
 */
export function analysisResultIdLookupIds(
  userId: string | null,
  requestedId: string,
  options?: AnalysisResultIdLookupOptions,
): string[] {
  const trimmed = requestedId.trim();
  if (!trimmed) return [];

  const scoped =
    userId && !trimmed.startsWith(`${userId}-`)
      ? `${userId}-${trimmed}`
      : null;

  if (options?.preferUserScope) {
    if (!scoped) return [trimmed];
    return [scoped, trimmed];
  }

  const candidates = [trimmed];
  if (scoped) candidates.push(scoped);
  return candidates;
}

/** Map a legacy/shared result_id to the signed-in user's scoped id for storage keys. */
export function userScopedResultId(
  userId: string,
  resultId: string,
): string {
  const trimmed = resultId.trim();
  if (!trimmed || trimmed.startsWith(`${userId}-`)) return trimmed;
  return `${userId}-${trimmed}`;
}
