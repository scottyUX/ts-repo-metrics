import type { DiscoveryResult, DiscoveredFile } from "./types";
import {
  MAX_DOC_FILES,
  MAX_PATH_DEPTH,
  SKIP_DIR_NAMES,
  isDocExtension,
  pathDepth,
} from "./constants";

const GITHUB_API = "https://api.github.com";

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

async function ghFetch<T>(
  url: string,
  token: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function pathInSkippedDir(path: string): boolean {
  const segments = path.replace(/\\/g, "/").split("/");
  return segments.some((seg) => SKIP_DIR_NAMES.has(seg.toLowerCase()));
}

export async function discoverDocs(
  owner: string,
  repo: string,
  githubToken: string,
  signal?: AbortSignal,
): Promise<DiscoveryResult & { warnings: string[] }> {
  const warnings: string[] = [];

  const repoMeta = await ghFetch<{ default_branch: string }>(
    `${GITHUB_API}/repos/${owner}/${repo}`,
    githubToken,
    signal,
  );

  const branch = repoMeta.default_branch ?? "main";
  const branchMeta = await ghFetch<{ commit: { sha: string } }>(
    `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    githubToken,
    signal,
  );

  const tree = await ghFetch<{ tree: GitHubTreeItem[]; truncated?: boolean }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branchMeta.commit.sha}?recursive=1`,
    githubToken,
    signal,
  );

  if (tree.truncated) {
    warnings.push("GitHub tree listing was truncated; some files may be missing.");
  }

  const candidates: DiscoveredFile[] = [];
  const skippedImages: string[] = [];

  for (const item of tree.tree) {
    if (item.type !== "blob") continue;
    if (pathInSkippedDir(item.path)) continue;
    if (pathDepth(item.path) > MAX_PATH_DEPTH) continue;

    // Only look in the documentation/ folder (case-insensitive)
    const normalizedPath = item.path.replace(/\\/g, "/").toLowerCase();
    if (!normalizedPath.startsWith("documentation/")) continue;

    if (!isDocExtension(item.path)) continue;

    candidates.push({
      path: item.path,
      pool: "docs",
      size: item.size,
    });
  }

  candidates.sort((a, b) => a.path.localeCompare(b.path));

  const files = candidates.slice(0, MAX_DOC_FILES);
  if (candidates.length > MAX_DOC_FILES) {
    warnings.push(
      `Found ${candidates.length} doc files; capped at ${MAX_DOC_FILES}.`,
    );
  }

  const docsPool = files.map((f) => f.path);
  const repoWide: string[] = [];

  // folder_found: true if any file in the tree starts with documentation/
  const folder_found = tree.tree.some(
    (item) =>
      item.type === "blob" &&
      item.path.replace(/\\/g, "/").toLowerCase().startsWith("documentation/"),
  );

  return {
    found: folder_found,
    docsPool,
    repoWide,
    files,
    skippedImages,
    warnings,
  };
}

