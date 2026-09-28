/**
 * POST /api/internal/structure
 *
 * Secret-protected structure metrics at an exact commit.
 * Does not use the student analyze path and does not touch its clone cache.
 * Django repositories are scored here; POST /api/analyze still skips them.
 */

import { timingSafeEqual } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  analyzeStructure,
  assertRepoRelativePath,
  checkoutCommit,
  parseGitHubUrl,
  StructurePathError,
} from "@repo-metrics/engine";

export const runtime = "nodejs";

/** One directory path counts as one entry and may expand to many files. */
const MAX_PATHS = 500;
const SHA40 = /^[0-9a-f]{40}$/;

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function redact(text: string): string {
  return text
    .replace(/x-access-token:[^@\s'"]+@/gi, "x-access-token:***@")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_***")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_***");
}

function parseRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const short = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (short?.[1] && short[2]) {
    const repo = short[2].endsWith(".git") ? short[2].slice(0, -4) : short[2];
    if (!repo) return null;
    return { owner: short[1], repo };
  }
  const parsed = parseGitHubUrl(trimmed);
  if (!parsed || parsed.pullNumber || parsed.branch) return null;
  return { owner: parsed.owner, repo: parsed.repo };
}

export async function POST(request: Request) {
  const expected = process.env.STRUCTURE_JOB_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!secretMatches(request.headers.get("x-structure-job-secret"), expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;
  if (typeof rec.repo !== "string" || typeof rec.commit !== "string" || !Array.isArray(rec.paths)) {
    return NextResponse.json(
      { error: "Body must be { repo, commit, paths }." },
      { status: 400 },
    );
  }

  const parsed = parseRepo(rec.repo);
  if (!parsed) {
    return NextResponse.json(
      { error: "repo must be owner/name or https://github.com/owner/name." },
      { status: 400 },
    );
  }

  const commit = rec.commit.trim().toLowerCase();
  if (!SHA40.test(commit)) {
    return NextResponse.json(
      { error: "commit must be a 40-character hex SHA." },
      { status: 400 },
    );
  }
  if (rec.paths.length < 1 || rec.paths.length > MAX_PATHS) {
    return NextResponse.json(
      { error: `paths must contain 1 to ${MAX_PATHS} entries.` },
      { status: 400 },
    );
  }

  const paths: string[] = [];
  try {
    for (const entry of rec.paths) {
      if (typeof entry !== "string") {
        return NextResponse.json(
          { error: "paths must be repo-relative strings." },
          { status: 400 },
        );
      }
      paths.push(assertRepoRelativePath(entry));
    }
  } catch (err) {
    const message = err instanceof StructurePathError ? err.message : "paths must be repo-relative.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const githubToken = process.env.GITHUB_TOKEN?.trim() || undefined;
  const cacheDir = path.join(os.tmpdir(), "repo-metrics-structure-cache");

  try {
    const checkout = await checkoutCommit({
      owner: parsed.owner,
      repo: parsed.repo,
      sha: commit,
      cacheDir,
      githubToken,
    });
    const report = await analyzeStructure(checkout.repoPath, { paths });
    return NextResponse.json({
      repo: `${parsed.owner}/${parsed.repo}`,
      commit: report.commit,
      files: report.files,
      missing: report.missing,
    });
  } catch (err) {
    if (err instanceof StructurePathError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[structure] job failed");
    const message = redact(err instanceof Error ? err.message : "structure job failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
