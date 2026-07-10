export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  const full = trimmed.startsWith("http")
    ? trimmed
    : `https://github.com/${trimmed}`;
  const m = full.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/,
  );
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/i, "") };
}

export function isValidGitHubUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) return true;
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(
    trimmed,
  );
}

/**
 * Canonical repo URL for storage/lookups: https://github.com/{owner}/{repo}
 * Strips www, .git, and trailing slashes so versioning keys stay stable.
 */
export function normalizeGitHubUrl(url: string): string {
  const parsed = parseGitHubUrl(url);
  if (parsed) {
    return `https://github.com/${parsed.owner}/${parsed.repo}`;
  }
  let trimmed = url.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/^(https?:\/\/)www\./i, "$1");
  }
  if (trimmed.includes("/") && !trimmed.includes("github.com")) {
    return `https://github.com/${trimmed}`;
  }
  return `https://${trimmed.replace(/^www\./i, "")}`;
}
