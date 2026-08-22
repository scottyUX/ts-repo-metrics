/**
 * GitHub URL parsing and validation.
 * Accepts repo URLs, pull-request URLs, and /tree/<branch> URLs.
 */

/** Repo root: https://github.com/owner/repo with optional .git and trailing slashes. */
const GITHUB_REPO_RE =
  /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\.git)?\/?$/;

/** Pull request: https://github.com/owner/repo/pull/123 */
const GITHUB_PULL_RE =
  /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\.git)?\/pull\/(\d+)\/?$/;

/** Branch tree: https://github.com/owner/repo/tree/<branch> (branch may contain slashes). */
const GITHUB_TREE_RE =
  /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\.git)?\/tree\/(.+)$/;

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  url: string;
  /** Present when the input was a pull-request URL. */
  pullNumber?: number;
  /** Present when the input was a /tree/<branch> URL. */
  branch?: string;
}

function stripGitSuffix(repo: string): string {
  return repo.endsWith(".git") ? repo.slice(0, -4) : repo;
}

/**
 * Parse and validate a GitHub repo, pull-request, or tree URL.
 * Normalizes trailing slashes. Canonical `url` is always https://github.com/owner/repo.
 *
 * @param input - URL string to validate.
 * @returns Parsed URL, or null if invalid.
 */
export function parseGitHubUrl(input: string): ParsedGitHubUrl | null {
  const normalized = input
    .trim()
    .replace(/\/+$/, "")
    .replace(/^https?:\/\/(?:www\.)?github\.com/i, "https://github.com");

  const pullMatch = normalized.match(GITHUB_PULL_RE);
  if (pullMatch) {
    const owner = pullMatch[1];
    const repoRaw = pullMatch[2];
    const pullStr = pullMatch[3];
    if (!owner || !repoRaw || !pullStr) return null;
    const repo = stripGitSuffix(repoRaw);
    const pullNumber = Number.parseInt(pullStr, 10);
    if (!Number.isFinite(pullNumber) || pullNumber <= 0) return null;
    return {
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}`,
      pullNumber,
    };
  }

  const treeMatch = normalized.match(GITHUB_TREE_RE);
  if (treeMatch) {
    const owner = treeMatch[1];
    const repoRaw = treeMatch[2];
    const branchRaw = treeMatch[3];
    if (!owner || !repoRaw || !branchRaw) return null;
    const repo = stripGitSuffix(repoRaw);
    const branch = decodeURIComponent(branchRaw).replace(/\/+$/, "");
    if (!branch) return null;
    return {
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}`,
      branch,
    };
  }

  const match = normalized.match(GITHUB_REPO_RE);
  if (!match) return null;
  const owner = match[1];
  const repoRaw = match[2];
  if (!owner || !repoRaw) return null;
  const repo = stripGitSuffix(repoRaw);
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
}

/**
 * Check if a string looks like a GitHub URL (for routing).
 *
 * @param input - User input.
 * @returns True if input starts with https://github.com/.
 */
export function isGitHubUrl(input: string): boolean {
  return input.trim().toLowerCase().startsWith("https://github.com/");
}

/**
 * Sanitize a branch or ref name for cache directories and result IDs.
 */
export function sanitizeRefForKey(ref: string): string {
  const cleaned = ref
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || "ref";
}
