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

function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim();
  // Prefer engine parse so .git / trailing slash collapse to canonical URL.
  const early = parseGitHubUrl(
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed.replace(/^http:\/\//i, "https://").replace(/^(https:\/\/)www\./i, "$1")
      : trimmed.includes("/") && !trimmed.includes("github.com")
        ? `https://github.com/${trimmed}`
        : `https://${trimmed.replace(/^www\./i, "")}`,
  );
  if (early) return early.url;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "").replace(/\.git$/i, "");
  }
  if (trimmed.includes("/") && !trimmed.includes("github.com")) {
    return `https://github.com/${trimmed.replace(/\.git$/i, "")}`;
  }
  return `https://${trimmed}`;
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
