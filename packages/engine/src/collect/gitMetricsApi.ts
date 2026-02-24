/**
 * Git metrics via GitHub REST API.
 *
 * Fallback for serverless environments (e.g. Vercel) where the git CLI is
 * unavailable. When the engine uses zipball download instead of git clone,
 * there is no .git directory, so extractGitMetrics and extractGitMetricsV2
 * return null. This module fetches commits from the GitHub API and computes
 * API-derived workflow proxies to populate RQ1 metrics.
 *
 * Note: These metrics are proxies—they approximate local git analysis using
 * commit metadata only (no diff stats). medianCommitSize, avgLinesPerCommit,
 * and largeCommitRatio are set to 0 in API mode.
 */

import { median } from "../utils/math.js";
import type { ParsedGitHubUrl } from "../utils/githubUrl.js";
import type { GitMetrics } from "../types/report.js";

const DAYS_WINDOW = 90;
const WEEKS_WINDOW = 13; // ~90 days
const MAX_COMMITS = 200;
const PER_PAGE = 100;
const BURST_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface GhCommit {
  sha: string;
  commit: {
    message: string;
    author?: { date: string } | null;
    committer?: { date: string } | null;
  };
}

function toDateStr(iso: string): string {
  return iso.slice(0, 10);
}

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

async function fetchCommits(
  parsed: ParsedGitHubUrl,
  token?: string,
): Promise<GhCommit[]> {
  const since = new Date(
    Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000,
  ).toISOString();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const all: GhCommit[] = [];
  let page = 1;

  while (all.length < MAX_COMMITS) {
    const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?since=${encodeURIComponent(since)}&per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} for ${parsed.url}`);
    }

    const batch = (await res.json()) as GhCommit[];
    if (batch.length === 0) break;

    all.push(...batch);
    if (batch.length < PER_PAGE) break;
    page++;
    if (page > 2) break; // cap at 200
  }

  return all.slice(0, MAX_COMMITS);
}

/**
 * Extract git workflow metrics from GitHub REST API.
 * Used when git CLI is unavailable (zipball mode on Vercel).
 *
 * @param parsed - Parsed GitHub URL with owner and repo.
 * @param token - Optional GITHUB_TOKEN for authenticated requests.
 * @returns GitMetrics with mode "api", or throws on API failure.
 */
export async function extractGitMetricsApi(
  parsed: ParsedGitHubUrl,
  token?: string,
): Promise<GitMetrics> {
  const commits = await fetchCommits(parsed, token);

  if (commits.length === 0) {
    return {
      mode: "api",
      totalCommits: 0,
      commitsPerWeek: 0,
      activeDaysLast90Days: 0,
      medianInterCommitHours: 0,
      burstRatio: 0,
      medianCommitMessageLength: 0,
      medianCommitSize: 0,
      avgLinesPerCommit: 0,
      largeCommitRatio: 0,
    };
  }

  const totalCommits = commits.length;
  const commitsPerWeek =
    Math.round((totalCommits / WEEKS_WINDOW) * 10) / 10;

  const uniqueDates = new Set<string>();
  const timestamps: number[] = [];
  const messageLengths: number[] = [];

  for (const c of commits) {
    const date =
      c.commit.author?.date ?? c.commit.committer?.date ?? "";
    if (date) {
      uniqueDates.add(toDateStr(date));
      timestamps.push(toMs(date));
    }
    messageLengths.push((c.commit.message ?? "").length);
  }

  const activeDaysLast90Days = uniqueDates.size;

  timestamps.sort((a, b) => a - b);
  const gapsMs: number[] = [];
  let burstCount = 0;

  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i]! - timestamps[i - 1]!;
    gapsMs.push(gap);
    if (gap <= BURST_WINDOW_MS) burstCount++;
  }

  const medianInterCommitHours =
    gapsMs.length > 0
      ? Math.round((median([...gapsMs].sort((a, b) => a - b)) / (1000 * 60 * 60)) * 10) / 10
      : 0;

  const burstRatio =
    gapsMs.length > 0
      ? Math.round((burstCount / gapsMs.length) * 1000) / 10
      : 0;

  const sortedLengths = [...messageLengths].sort((a, b) => a - b);
  const medianCommitMessageLength = median(sortedLengths);

  return {
    mode: "api",
    totalCommits,
    commitsPerWeek,
    activeDaysLast90Days,
    medianInterCommitHours,
    burstRatio,
    medianCommitMessageLength,
    medianCommitSize: 0,
    avgLinesPerCommit: 0,
    largeCommitRatio: 0,
  };
}
