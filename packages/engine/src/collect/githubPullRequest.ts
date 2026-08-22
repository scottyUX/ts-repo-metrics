/**
 * GitHub REST helpers for pull-request metadata and changed files.
 */

import { isAnalyzableSourcePath } from "../utils/constants.js";
import type { ParsedGitHubUrl } from "../utils/githubUrl.js";

const API_VERSION = "2022-11-28";
const ACCEPT = "application/vnd.github+json";

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: ACCEPT,
    "X-GitHub-Api-Version": API_VERSION,
  };
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1]!;
  }
  return null;
}

/** GitHub pull-file statuses that still exist on the head tree. */
const KEEP_STATUSES = new Set([
  "added",
  "modified",
  "renamed",
  "copied",
  "changed",
]);

export interface GithubPullFile {
  filename: string;
  status: string;
}

/**
 * Repo-relative TypeScript/TSX paths from a PR file list (head tree).
 * Removed files and ignored directories are dropped.
 */
export function filterChangedSourcePaths(files: GithubPullFile[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    if (!KEEP_STATUSES.has(f.status)) continue;
    const rel = f.filename.replace(/\\/g, "/");
    if (!isAnalyzableSourcePath(rel)) continue;
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  return out;
}

export interface PullRequestAnalysisMeta {
  number: number;
  title: string;
  state: string;
  headSha: string;
  baseSha: string;
  headRef: string;
  baseRef: string;
  changedSourceFiles: string[];
}

interface GhPull {
  number: number;
  title: string;
  state: string;
  head?: { sha?: string; ref?: string };
  base?: { sha?: string; ref?: string };
}

/**
 * Fetch a pull request and its changed source files.
 *
 * @throws if the PR cannot be loaded.
 */
export async function fetchPullRequestAnalysis(
  parsed: ParsedGitHubUrl,
  pullNumber: number,
  token?: string,
): Promise<PullRequestAnalysisMeta> {
  const pullUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${pullNumber}`;
  const pullRes = await fetch(pullUrl, { headers: headers(token) });
  if (!pullRes.ok) {
    throw new Error(
      `Could not load pull request #${pullNumber} (${pullRes.status}). Check the URL and that the token can read this repository.`,
    );
  }
  const pull = (await pullRes.json()) as GhPull;
  const headSha = pull.head?.sha?.trim() ?? "";
  const baseSha = pull.base?.sha?.trim() ?? "";
  if (!headSha || !baseSha) {
    throw new Error(`Pull request #${pullNumber} is missing head or base SHA.`);
  }

  const files: GithubPullFile[] = [];
  let nextUrl: string | null =
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${pullNumber}/files?per_page=100`;
  while (nextUrl) {
    const filesRes = await fetch(nextUrl, { headers: headers(token) });
    if (!filesRes.ok) {
      throw new Error(
        `Could not load files for pull request #${pullNumber} (${filesRes.status}).`,
      );
    }
    const batch = (await filesRes.json()) as GithubPullFile[];
    files.push(...batch);
    nextUrl = parseLinkNext(filesRes.headers.get("link"));
  }

  return {
    number: pull.number ?? pullNumber,
    title: pull.title ?? "",
    state: pull.state ?? "",
    headSha,
    baseSha,
    headRef: pull.head?.ref ?? "",
    baseRef: pull.base?.ref ?? "",
    changedSourceFiles: filterChangedSourcePaths(files),
  };
}
