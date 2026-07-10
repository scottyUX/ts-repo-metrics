/**
 * Analyze a repository from a GitHub URL.
 * Clones (or uses cache), then runs the full analysis pipeline.
 * When the git binary is unavailable (e.g. Vercel), falls back to downloading the repo as a zipball.
 */

import { parseGitHubUrl } from "../utils/githubUrl.js";
import { cloneOrUseCache } from "../collect/gitClone.js";
import { downloadZipball, getSourceFromGitHubApi } from "../collect/downloadZipball.js";
import { extractGitMetricsApi } from "../collect/gitMetricsApi.js";
import { fetchGitHubRepositoryMeta } from "../collect/githubRepoMeta.js";
import { getSourceMetadata } from "../collect/repoMetadata.js";
import { analyzeRepo } from "./analyzeRepo.js";
import type { RepoReport } from "../types/report.js";

export interface AnalyzeFromGitHubUrlOptions {
  useCache?: boolean;
  /** Writable directory for clone cache (e.g. os.tmpdir() on Vercel). Default: process.cwd() */
  cacheDir?: string;
  /**
   * GitHub PAT for private repos and higher API limits.
   * When set, overrides GITHUB_TOKEN for clone, zipball, and REST enrichment.
   */
  githubToken?: string;
}

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

/**
 * Canonical https://github.com/{owner}/{repo} for clone/API paths.
 * Avoids substring host checks and polynomial trailing-slash regexes (CodeQL).
 */
function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim();
  let candidate = trimmed;

  if (trimmed.startsWith("http://")) {
    candidate = `https://${trimmed.slice("http://".length)}`;
  } else if (!trimmed.startsWith("https://")) {
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("github.com/") || lower.startsWith("www.github.com/")) {
      candidate = `https://${lower.startsWith("www.") ? trimmed.slice(4) : trimmed}`;
    } else if (!trimmed.includes("://") && trimmed.includes("/")) {
      // owner/repo shorthand (no scheme)
      candidate = `https://github.com/${trimmed}`;
    } else {
      candidate = `https://${trimmed}`;
    }
  }

  try {
    const u = new URL(candidate);
    if (u.hostname.toLowerCase() === "www.github.com") {
      u.hostname = "github.com";
      candidate = u.toString();
    }
  } catch {
    // keep candidate
  }

  const parsed = parseGitHubUrl(candidate);
  if (parsed) return parsed.url;

  return stripGitSuffix(stripTrailingSlashes(candidate));
}

function isGitUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
  return code === "ENOENT" || /spawn\s+git\s+ENOENT/i.test(msg) || /git.*not found/i.test(msg);
}

/**
 * Clone a GitHub repo (or use cache) and run the full analysis pipeline.
 * If the git binary is not available (e.g. on Vercel), downloads the repo as a zipball instead.
 *
 * @param url - GitHub URL or "owner/repo".
 * @param options - useCache (default true), cacheDir (default process.cwd()).
 * @returns The analysis report.
 */
export async function analyzeFromGitHubUrl(
  url: string,
  options?: AnalyzeFromGitHubUrlOptions,
): Promise<RepoReport> {
  const normalizedUrl = normalizeGitHubUrl(url);
  const parsed = parseGitHubUrl(normalizedUrl);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${url}. Use https://github.com/owner/repo or owner/repo.`);
  }

  const useCache = options?.useCache ?? true;
  const cacheDir = options?.cacheDir ?? process.cwd();
  const ghToken =
    options?.githubToken?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    undefined;

  let repoPath: string;
  let source: { type: "local" | "git"; url: string; commit: string; branch: string };
  let usedZipball = false;

  try {
    repoPath = await cloneOrUseCache(parsed, useCache, cacheDir, ghToken);
    source = await getSourceMetadata(repoPath, "git", parsed.url);
  } catch (err) {
    if (isGitUnavailable(err)) {
      usedZipball = true;
      source = await getSourceFromGitHubApi(parsed, ghToken);
      repoPath = await downloadZipball(parsed, cacheDir, useCache, ghToken, source.commit || undefined);
    } else {
      throw err;
    }
  }

  const report = await analyzeRepo(repoPath, { source });

  const token = ghToken;
  try {
    const ghMeta = await fetchGitHubRepositoryMeta(parsed, token);
    if (ghMeta) {
      report.github = ghMeta;
    }
  } catch {
    // optional enrichment
  }

  if (usedZipball) {
    try {
      const { metrics, contributors, commitCalendar } =
        await extractGitMetricsApi(parsed, token);
      report.git = metrics;
      if (contributors.length > 0) {
        report.contributors = contributors;
      }
      if (commitCalendar) {
        report.commitCalendar = commitCalendar;
      }
    } catch {
      report.git = {
        mode: "none",
        unavailable: true,
        totalCommits: 0,
        medianCommitSize: 0,
        avgLinesPerCommit: 0,
        largeCommitRatio: 0,
        commitsPerWeek: 0,
      };
    }
  }

  return report;
}
