/**
 * POST /api/analyze
 * Triggers repo-metrics analysis for a public GitHub repo URL.
 * Returns { status, resultId } or full result.
 * @see Story 4.1
 */

import { NextRequest, NextResponse } from "next/server";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/supabase/server";
import { analyzeFromGitHubUrl } from "@repo-metrics/engine";

export const runtime = "nodejs";

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  const full = trimmed.startsWith("http")
    ? trimmed
    : `https://github.com/${trimmed}`;
  const m = full.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/
  );
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, "") };
}

function isValidGitHubUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) return true;
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(
    trimmed
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = (body?.url ?? "").toString().trim();

    if (!url) {
      return NextResponse.json(
        { error: "Missing url. Provide { url: string }." },
        { status: 400 }
      );
    }

    if (!isValidGitHubUrl(url)) {
      return NextResponse.json(
        { error: "Invalid GitHub URL. Use https://github.com/owner/repo" },
        { status: 400 }
      );
    }

    const normalizedUrl =
      url.startsWith("http") ?
        url
      : url.includes("/") && !url.includes("github.com")
        ? `https://github.com/${url}`
        : `https://${url}`;

    const cacheDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
    const report = await analyzeFromGitHubUrl(normalizedUrl, {
      useCache: true,
      cacheDir,
    });

    const parsed = parseGitHubUrl(normalizedUrl);
    const commitSha = report.source?.commit ?? null;
    
    // Generate resultId: owner-repo-commitSha (or UUID if no commit)
    let resultId: string;
    if (parsed) {
      const suffix = commitSha 
        ? commitSha.slice(0, 12) 
        : randomUUID().replace(/-/g, "").slice(0, 12); // Remove dashes from UUID
      resultId = `${parsed.owner}-${parsed.repo}-${suffix}`;
    } else {
      resultId = randomUUID();
    }

    console.log("[analyze] Generated resultId:", resultId, "commitSha:", commitSha);

    const row = {
      result_id: resultId,
      repo_url: normalizedUrl,
      commit_sha: commitSha,
      report_json: report as object,
    };

    const { error } = await getSupabase()
      .from("analyses")
      .upsert(row, { onConflict: "result_id" });

    if (error) {
      console.error("Supabase upsert failed:", error);
      return NextResponse.json(
        { error: "Failed to save result.", status: "failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "done",
      resultId,
      report,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json(
      { error: message, status: "failed" },
      { status: 500 }
    );
  }
}
