/**
 * GitHub URL parsing and validation.
 * Only accepts public GitHub repo URLs (https://github.com/owner/repo).
 */

/** Matches https://github.com/owner/repo with optional .git and trailing slashes. */
const GITHUB_URL_RE =
  /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\.git)?\/?$/;

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  url: string;
}

/**
 * Parse and validate a GitHub public repo URL.
 * Normalizes trailing slashes.
 *
 * @param input - URL string to validate.
 * @returns Parsed URL with owner and repo, or null if invalid.
 */
export function parseGitHubUrl(input: string): ParsedGitHubUrl | null {
  const normalized = input.trim().replace(/\/+$/, "");
  const match = normalized.match(GITHUB_URL_RE);
  if (!match) return null;
  let [, owner, repo] = match;
  if (!owner || !repo) return null;
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);
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
