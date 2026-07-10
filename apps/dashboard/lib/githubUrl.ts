/**
 * GitHub URL validation for the analyze form.
 * Supports: https://github.com/owner/repo, github.com/owner/repo, owner/repo
 */

const GITHUB_URL_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/)?(?:\.[a-zA-Z]+)?$/;
const OWNER_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export function isValidGitHubUrl(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (OWNER_REPO_RE.test(trimmed)) return true;
  return GITHUB_URL_RE.test(trimmed);
}

/**
 * Canonical repo URL: https://github.com/{owner}/{repo}
 * Strips www, .git, and trailing slashes.
 */
export function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim();
  const ownerRepo =
    trimmed.match(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/i,
    ) ??
    (OWNER_REPO_RE.test(trimmed)
      ? trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/i)
      : null);

  if (ownerRepo) {
    const owner = ownerRepo[1]!;
    const repo = ownerRepo[2]!.replace(/\.git$/i, "");
    return `https://github.com/${owner}/${repo}`;
  }

  let fallback = trimmed.replace(/\/+$/, "").replace(/\.git$/i, "");
  if (fallback.startsWith("http://") || fallback.startsWith("https://")) {
    return fallback.replace(/^(https?:\/\/)www\./i, "$1");
  }
  if (OWNER_REPO_RE.test(fallback)) {
    return `https://github.com/${fallback}`;
  }
  return `https://${fallback.replace(/^www\./i, "")}`;
}
