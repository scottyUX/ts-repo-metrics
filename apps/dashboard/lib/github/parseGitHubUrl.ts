export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  pullNumber?: number;
  branch?: string;
} | null {
  const trimmed = url.trim();
  const full = trimmed.startsWith("http")
    ? trimmed
    : `https://github.com/${trimmed}`;
  const pull = full.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\.git)?\/pull\/(\d+)/,
  );
  if (pull) {
    return {
      owner: pull[1]!,
      repo: pull[2]!.replace(/\.git$/, ""),
      pullNumber: Number.parseInt(pull[3]!, 10),
    };
  }
  const tree = full.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\.git)?\/tree\/(.+?)\/?$/,
  );
  if (tree) {
    return {
      owner: tree[1]!,
      repo: tree[2]!.replace(/\.git$/, ""),
      branch: decodeURIComponent(tree[3]!),
    };
  }
  const m = full.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/,
  );
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, "") };
}

export function isValidGitHubUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) return true;
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(
    trimmed,
  );
}

export function normalizeGitHubUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("http")) return trimmed;
  if (trimmed.includes("/") && !trimmed.includes("github.com")) {
    return `https://github.com/${trimmed}`;
  }
  return `https://${trimmed}`;
}
