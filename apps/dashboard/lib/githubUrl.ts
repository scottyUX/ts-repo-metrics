/**
 * GitHub URL validation for the analyze form.
 * Supports: https://github.com/owner/repo, github.com/owner/repo, owner/repo
 */

const GITHUB_URL_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/)?(?:\.[a-zA-Z]+)?$/;
const OWNER_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function stripTrailingSlashes(value: string): string {
  let out = value;
  while (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function stripGitSuffix(value: string): string {
  return value.length >= 4 && value.toLowerCase().endsWith(".git")
    ? value.slice(0, -4)
    : value;
}

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

  // Prefer URL parsing for absolute URLs so host checks are exact.
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase();
      if (host === "github.com" || host === "www.github.com") {
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) {
          const owner = parts[0]!;
          const repo = stripGitSuffix(parts[1]!);
          if (
            /^[a-zA-Z0-9_.-]+$/.test(owner) &&
            /^[a-zA-Z0-9_.-]+$/.test(repo)
          ) {
            return `https://github.com/${owner}/${repo}`;
          }
        }
      }
    } catch {
      // fall through
    }
  }

  const ownerRepoMatch = trimmed.match(
    /^(?:(?:https?:\/\/)?(?:www\.)?github\.com\/)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/i,
  );
  if (ownerRepoMatch) {
    const owner = ownerRepoMatch[1]!;
    const repo = stripGitSuffix(ownerRepoMatch[2]!);
    return `https://github.com/${owner}/${repo}`;
  }

  const fallback = stripGitSuffix(stripTrailingSlashes(trimmed));
  if (OWNER_REPO_RE.test(fallback)) {
    return `https://github.com/${fallback}`;
  }
  if (fallback.startsWith("http://") || fallback.startsWith("https://")) {
    return fallback;
  }
  return `https://${fallback}`;
}
