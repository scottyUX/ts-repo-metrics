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

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  const full = trimmed.startsWith("http")
    ? trimmed
    : `https://github.com/${trimmed}`;
  const m = full.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/,
  );
  if (!m) return null;
  return { owner: m[1]!, repo: stripGitSuffix(m[2]!) };
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

  // Best-effort fallback without polynomial regexes or host substring checks.
  let trimmed = stripGitSuffix(stripTrailingSlashes(url.trim()));
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      if (u.hostname.toLowerCase() === "www.github.com") {
        u.hostname = "github.com";
      }
      return stripGitSuffix(stripTrailingSlashes(u.toString()));
    } catch {
      return trimmed;
    }
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("github.com/") || lower.startsWith("www.github.com/")) {
    const withoutWww = lower.startsWith("www.") ? trimmed.slice(4) : trimmed;
    return `https://${withoutWww}`;
  }

  // owner/repo shorthand (no scheme/host)
  if (trimmed.includes("/") && !trimmed.includes("://")) {
    return `https://github.com/${trimmed}`;
  }

  return `https://${trimmed}`;
}
