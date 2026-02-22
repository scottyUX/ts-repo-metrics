/**
 * GitHub URL validation for the analyze form.
 * Supports: https://github.com/owner/repo, github.com/owner/repo
 */

const GITHUB_URL_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/)?(?:\.[a-zA-Z]+)?$/;

export function isValidGitHubUrl(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  if (!trimmed) return false;
  return GITHUB_URL_RE.test(trimmed);
}

export function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
