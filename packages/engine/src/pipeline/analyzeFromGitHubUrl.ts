/**
 * Analyze a repository from a GitHub URL.
 * Clones (or uses cache), then runs the full analysis pipeline.
 * Git is required — there is no zipball fallback.
 */

import { parseGitHubUrl } from "../utils/githubUrl.js";
import { cloneOrUseCache, type CloneCheckout } from "../collect/gitClone.js";
import { fetchPullRequestAnalysis } from "../collect/githubPullRequest.js";
import { fetchGitHubRepositoryMeta } from "../collect/githubRepoMeta.js";
import { getSourceMetadata } from "../collect/repoMetadata.js";
import { analyzeRepo } from "./analyzeRepo.js";
import type { RepoReport, SourceInfo } from "../types/report.js";

export type AnalyzeRef =
  | { type: "default" }
  | { type: "pr"; prNumber: number }
  | { type: "branch"; branch: string };

export interface AnalyzeFromGitHubUrlOptions {
  useCache?: boolean;
  /** Writable directory for clone cache. Default: process.cwd() */
  cacheDir?: string;
  /**
   * GitHub PAT for private repos and higher API limits.
   * When set, overrides GITHUB_TOKEN for clone and REST enrichment.
   */
  githubToken?: string;
  /** Analysis target. Inferred from a /pull/N or /tree/<branch> URL when omitted. */
  ref?: AnalyzeRef;
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

function resolveAnalyzeRef(
  parsed: ReturnType<typeof parseGitHubUrl>,
  explicit?: AnalyzeRef,
): AnalyzeRef {
  if (explicit) return explicit;
  if (parsed?.pullNumber) return { type: "pr", prNumber: parsed.pullNumber };
  if (parsed?.branch) return { type: "branch", branch: parsed.branch };
  return { type: "default" };
}

function checkoutForRef(ref: AnalyzeRef): CloneCheckout {
  if (ref.type === "pr") return { kind: "pr", number: ref.prNumber };
  if (ref.type === "branch") return { kind: "branch", name: ref.branch };
  return { kind: "default" };
}

/**
 * Clone a GitHub repo (or use cache) and run the full analysis pipeline.
 *
 * Git must be installed. Serverless zipball analysis is not supported.
 *
 * @param url - GitHub URL or "owner/repo" (also accepts /pull/N and /tree/branch).
 * @param options - useCache (default true), cacheDir, githubToken, ref.
 * @returns The analysis report.
 */
export async function analyzeFromGitHubUrl(
  url: string,
  options?: AnalyzeFromGitHubUrlOptions,
): Promise<RepoReport> {
  const normalizedUrl = normalizeGitHubUrl(url);
  const parsed = parseGitHubUrl(normalizedUrl);
  if (!parsed) {
    throw new Error(
      `Invalid GitHub URL: ${url}. Use https://github.com/owner/repo, a pull request URL, or owner/repo.`,
    );
  }

  const useCache = options?.useCache ?? true;
  const cacheDir = options?.cacheDir ?? process.cwd();
  const ghToken =
    options?.githubToken?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    undefined;
  const ref = resolveAnalyzeRef(parsed, options?.ref);

  let includePaths: string[] | undefined;
  let gitRevRange: string | undefined;
  let sourceExtras: Partial<SourceInfo> = { scope: "repo" };

  if (ref.type === "pr") {
    const pr = await fetchPullRequestAnalysis(parsed, ref.prNumber, ghToken);
    includePaths = pr.changedSourceFiles;
    gitRevRange = `${pr.baseSha}...${pr.headSha}`;
    sourceExtras = {
      scope: "pr",
      prNumber: pr.number,
      baseSha: pr.baseSha,
      headSha: pr.headSha,
      changedFiles: pr.changedSourceFiles,
      branch: pr.headRef,
    };
  }

  let repoPath: string;
  let source: SourceInfo;

  try {
    repoPath = await cloneOrUseCache(
      parsed,
      useCache,
      cacheDir,
      ghToken,
      checkoutForRef(ref),
    );
    source = {
      ...(await getSourceMetadata(repoPath, "git", parsed.url)),
      ...sourceExtras,
    };
    if (ref.type === "pr" && sourceExtras.headSha) {
      source.commit = sourceExtras.headSha;
    }
    if (ref.type === "branch") {
      source.branch = ref.branch;
      source.scope = "repo";
    }
  } catch (err) {
    if (isGitUnavailable(err)) {
      throw new Error(
        "Git is required to analyze repositories. Install git locally, or deploy on Railway. The Vercel zipball path is no longer supported.",
      );
    }
    throw err;
  }

  const report = await analyzeRepo(repoPath, {
    source,
    includePaths,
    gitRevRange,
  });

  try {
    const ghMeta = await fetchGitHubRepositoryMeta(parsed, ghToken);
    if (ghMeta) {
      report.github = ghMeta;
    }
  } catch {
    // optional enrichment
  }

  return report;
}
