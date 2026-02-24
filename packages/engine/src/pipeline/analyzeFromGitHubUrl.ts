/**
 * Analyze a repository from a GitHub URL.
 * Clones (or uses cache), then runs the full analysis pipeline.
 * When the git binary is unavailable (e.g. Vercel), falls back to downloading the repo as a zipball.
 */

import { parseGitHubUrl } from "../utils/githubUrl.js";
import { cloneOrUseCache } from "../collect/gitClone.js";
import { downloadZipball, getSourceFromGitHubApi } from "../collect/downloadZipball.js";
import { extractGitMetricsApi } from "../collect/gitMetricsApi.js";
import { getSourceMetadata } from "../collect/repoMetadata.js";
import { analyzeRepo } from "./analyzeRepo.js";
import type { RepoReport } from "../types/report.js";

export interface AnalyzeFromGitHubUrlOptions {
  useCache?: boolean;
  /** Writable directory for clone cache (e.g. os.tmpdir() on Vercel). Default: process.cwd() */
  cacheDir?: string;
}

function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.includes("/") && !trimmed.includes("github.com")) {
    return `https://github.com/${trimmed}`;
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

  let repoPath: string;
  let source: { type: "local" | "git"; url: string; commit: string; branch: string };
  let usedZipball = false;

  try {
    repoPath = await cloneOrUseCache(parsed, useCache, cacheDir);
    source = await getSourceMetadata(repoPath, "git", parsed.url);
  } catch (err) {
    if (isGitUnavailable(err)) {
      usedZipball = true;
      repoPath = await downloadZipball(parsed, cacheDir, useCache);
      source = await getSourceFromGitHubApi(parsed);
    } else {
      throw err;
    }
  }

  const report = await analyzeRepo(repoPath, { source });

  if (usedZipball) {
    try {
      report.git = await extractGitMetricsApi(
        parsed,
        process.env.GITHUB_TOKEN,
      );
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
