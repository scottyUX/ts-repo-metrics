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

/**
 * Candidate result_ids to try when resolving a stored analysis row.
 * Supports legacy URLs (owner-repo-commit) for signed-in users who re-analyzed
 * after the per-user result_id change.
 */
export function analysisResultIdLookupIds(
  userId: string | null,
  requestedId: string,
): string[] {
  const trimmed = requestedId.trim();
  if (!trimmed) return [];

  const candidates = [trimmed];
  if (userId && !trimmed.startsWith(`${userId}-`)) {
    candidates.push(`${userId}-${trimmed}`);
  }
  return candidates;
}
