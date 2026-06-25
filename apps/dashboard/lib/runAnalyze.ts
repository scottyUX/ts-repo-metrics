/**
 * Client: POST /api/analyze for a GitHub repo URL and cache report in sessionStorage.
 */

import { ANALYZE_SIGN_IN_REQUIRED_MESSAGE } from "@/lib/analyzeConstants";
import { normalizeGitHubUrl } from "@/lib/githubUrl";
import { writeReportToSessionStorage } from "@/lib/reportLocalCache";
import type { RepoReport } from "@/lib/reportTypes";

export type RunAnalyzeResult =
  | { ok: true; resultId: string; analysisSkipped?: { message: string } }
  | { ok: false; error: string };

export type AnalyzeRequestBody =
  | { url: string }
  | {
      url: string;
      course_id?: string | null;
      team_name?: string | null;
    };

/** Re-export for UI matching 401 payloads. */
export { ANALYZE_SIGN_IN_REQUIRED_MESSAGE };

export async function runAnalyzeFromUrl(
  rawUrl: string,
  extra?: Omit<AnalyzeRequestBody, "url">,
): Promise<RunAnalyzeResult> {
  try {
    const payload: AnalyzeRequestBody = {
      url: normalizeGitHubUrl(rawUrl),
      ...extra,
    };
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    let data: {
      error?: string;
      hint?: string;
      resultId?: string;
      report?: RepoReport;
      code?: string;
    } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      return { ok: false, error: "Analysis failed" };
    }
    if (!res.ok) {
      if (res.status === 401) {
        return {
          ok: false,
          error: data.error ?? ANALYZE_SIGN_IN_REQUIRED_MESSAGE,
        };
      }
      const base = (data.error ?? "Analysis failed") as string;
      const withHint =
        typeof data.hint === "string" && data.hint.trim() ?
          `${base} — ${data.hint}`
        : base;
      return { ok: false, error: withHint };
    }
    const resultId = data.resultId;
    if (!resultId || typeof resultId !== "string") {
      return { ok: false, error: "Invalid response" };
    }
    if (data.report) {
      writeReportToSessionStorage(resultId, data.report);
    }
    return {
      ok: true,
      resultId,
      ...(data.report?.analysisSkipped
        ? { analysisSkipped: { message: data.report.analysisSkipped.message } }
        : {}),
    };
  } catch {
    return { ok: false, error: "Analysis failed. Please try again." };
  }
}
