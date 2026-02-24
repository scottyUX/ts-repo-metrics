/**
 * Download a GitHub repo as a zipball (no git binary required).
 * Used when git is unavailable (e.g. Vercel serverless).
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import type { ParsedGitHubUrl } from "../utils/githubUrl.js";
import type { SourceInfo } from "../types/report.js";

const CACHE_DIR = ".cache/ts-repo-metrics";

function cacheKey(parsed: ParsedGitHubUrl): string {
  return `${parsed.owner}-${parsed.repo}`;
}

/**
 * Fetch default branch and latest commit SHA from GitHub API (no auth for public repos).
 */
export async function getSourceFromGitHubApi(
  parsed: ParsedGitHubUrl,
): Promise<SourceInfo> {
  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const res = await fetch(apiUrl, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} for ${parsed.url}`);
  }
  const repo = (await res.json()) as { default_branch?: string };
  const branch = repo.default_branch ?? "main";

  const commitsUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits/${branch}`;
  const commitsRes = await fetch(commitsUrl, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!commitsRes.ok) {
    return {
      type: "git",
      url: parsed.url,
      commit: "",
      branch,
    };
  }
  const commitData = (await commitsRes.json()) as { sha?: string };
  const commit = commitData.sha ?? "";

  return {
    type: "git",
    url: parsed.url,
    commit,
    branch,
  };
}

/**
 * Download repo as zipball and extract to cache dir. Returns path to repo root.
 * Zipball has one top-level dir (owner-repo-sha); we flatten so repo root is fullPath.
 * If useCache is true and fullPath already exists (from a prior run), returns it.
 */
export async function downloadZipball(
  parsed: ParsedGitHubUrl,
  baseDir: string,
  useCache: boolean = true,
): Promise<string> {
  const fullPath = path.resolve(baseDir, CACHE_DIR, cacheKey(parsed));

  const parentDir = path.dirname(fullPath);
  mkdirSync(parentDir, { recursive: true });

  if (useCache && existsSync(fullPath)) {
    try {
      const entries = readdirSync(fullPath);
      if (entries.length > 0) return fullPath;
    } catch {
      // ignore, re-download
    }
  }

  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true });
  }

  const zipUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/zipball`;
  const res = await fetch(zipUrl, {
    redirect: "follow",
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to download zipball: ${res.status} for ${parsed.url}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);
  const extractDir = fullPath + ".extract";
  zip.extractAllTo(extractDir, true);

  const entries = readdirSync(extractDir);
  if (entries.length !== 1 || !entries[0]) {
    rmSync(extractDir, { recursive: true });
    throw new Error("Zipball had unexpected structure");
  }
  const innerDir = path.join(extractDir, entries[0]);
  mkdirSync(fullPath, { recursive: true });
  for (const name of readdirSync(innerDir)) {
    renameSync(path.join(innerDir, name), path.join(fullPath, name));
  }
  rmSync(extractDir, { recursive: true });

  return fullPath;
}
