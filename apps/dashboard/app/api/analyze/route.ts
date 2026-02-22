/**
 * POST /api/analyze
 * Triggers repo-metrics analysis for a public GitHub repo URL.
 * Returns { status, resultId } or full result.
 * @see Story 4.1
 */

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resultsStore } from "@/lib/resultsStore";

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

    const repoRoot = path.join(process.cwd(), "..", "..");
    const cliPath = path.join(repoRoot, "src", "cli.ts");

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn("npx", ["tsx", cliPath, "analyze", normalizedUrl], {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (c) => (stdout += c.toString()));
      proc.stderr?.on("data", (c) => (stderr += c.toString()));

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Process exited with code ${code}`));
          return;
        }
        resolve(stdout);
      });

      proc.on("error", reject);
    });

    let report: unknown;
    try {
      report = JSON.parse(result);
    } catch {
      return NextResponse.json(
        { error: "Analysis succeeded but produced invalid JSON." },
        { status: 500 }
      );
    }

    const parsed = parseGitHubUrl(normalizedUrl);
    const resultId =
      parsed && typeof report === "object" && report !== null && "source" in report
        ? `${parsed.owner}-${parsed.repo}-${(report as { source?: { commit?: string } }).source?.commit?.slice(0, 7) ?? randomUUID().slice(0, 7)}`
        : randomUUID();

    resultsStore.set(resultId, report);

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

