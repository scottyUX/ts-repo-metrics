/**
 * POST /api/analyze
 * Triggers repo-metrics analysis for a GitHub repo, branch, or pull request URL.
 * Returns { status, resultId } or full result.
 * Signed-in dashboard users only (requires Supabase session when user-auth is configured).
 */

import type { RepoReport as EngineRepoReport, AnalyzeRef } from "@repo-metrics/engine";
import { analyzeFromGitHubUrl, parseGitHubUrl } from "@repo-metrics/engine";
import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  getSupabase,
  isSupabaseConfigured,
  isDevReportMemoryFallback,
} from "@/lib/supabase/server";
import {
  createUserSupabaseServerClient,
  isUserSupabaseConfigured,
} from "@/lib/supabase/server-user";
import { getDecryptedGitHubTokenForUser } from "@/lib/userGitHubToken";
import { ANALYZE_SIGN_IN_REQUIRED_MESSAGE } from "@/lib/analyzeConstants";
import type { RepoReport as DashboardRepoReport } from "@/lib/reportTypes";
import { devStoreReport } from "@/lib/devReportStore";
import { isValidGitHubUrl, normalizeGitHubUrl } from "@/lib/github/parseGitHubUrl";
import { parseAnalyzeRef } from "@/lib/github/analyzeRef";
import { buildAnalysisResultId } from "@/lib/analysisResultId";

export const runtime = "nodejs";

/** Ensure report is JSON-serializable for PostgREST jsonb (strips non-JSON values). */
function reportAsJsonObject(report: unknown): object {
  return JSON.parse(JSON.stringify(report)) as object;
}

/** PostgREST/Postgres cues that analyses is missing newer columns after a deploy without migration. */
function analysesUpsertLooksLikeStaleSchema(error: {
  message?: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}): boolean {
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  const lowered = blob.toLowerCase();
  return (
    error.code === "PGRST204" ||
    /\bcourse_id\b/i.test(blob) ||
    /\bteam_name\b/i.test(blob) ||
    /\bgithub_login\b/i.test(blob) ||
    /\bdoc_review_json\b/i.test(blob) ||
    (/\banalyses\b/.test(lowered) &&
      /\bcolumn\b/.test(lowered) &&
      /\b(find|exist|unknown|undefined)\b/.test(lowered))
  );
}

const ANALYSES_MIGRATION_HINT =
  "Add columns on public.analyses: run supabase/migrations/20260522000000_analyses_course_metadata.sql in the Supabase SQL Editor (or the full snippet in supabase/run_in_dashboard_sql_editor.sql).";

// ---------------------------------------------------------------------------
// Course allow-list
// Add a new entry here whenever a new course section is created.
// course_id values must exactly match the slugs used in /course/[courseId]/analyze URLs.
// ---------------------------------------------------------------------------
const ALLOWED_COURSE_IDS = new Set([
  "CSE115A-Summer26",
  "CSE115A-Fall26-S01",
  "CSE115A-Fall26-S02",
  "CSE115A-Winter26",
  "CSE115A-Spring26",
  "CSE115B-Winter26",
  "CSE115C-Spring26",
  // Add future sections here, e.g.:
  // "CSE115A-Summer27",
]);

/** Merge course/research tagging into persisted `report_json` (Option B from course epic). */
function reportWithSubmission(
  report: EngineRepoReport,
  submission: {
    course_id: string | null;
    team_name: string | null;
    github_login: string | null;
  },
): EngineRepoReport & {
  _submission: typeof submission;
} {
  return {
    ...(report as object as EngineRepoReport),
    _submission: submission,
  } as EngineRepoReport & {
    _submission: typeof submission;
  };
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body.", status: "failed" },
        { status: 400 },
      );
    }

    if (!isUserSupabaseConfigured()) {
      return NextResponse.json(
        {
          error:
            "Sign-in is not configured for this deployment. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
          status: "failed",
          code: "auth_unavailable",
        },
        { status: 503 },
      );
    }

    let userId: string | null = null;
    let githubToken: string | undefined;
    let authUser: User | null = null;

    try {
      const userSb = await createUserSupabaseServerClient();
      const {
        data: { user },
      } = await userSb.auth.getUser();
      authUser = user ?? null;
      if (authUser) {
        userId = authUser.id;
        if (isSupabaseConfigured()) {
          const tok = await getDecryptedGitHubTokenForUser(authUser.id);
          if (tok) githubToken = tok;
        }
      }
    } catch (err) {
      console.warn("[analyze] Could not read auth session:", err);
    }

    if (!authUser) {
      return NextResponse.json(
        {
          error: ANALYZE_SIGN_IN_REQUIRED_MESSAGE,
          status: "failed",
          code: "sign_in_required",
        },
        { status: 401 },
      );
    }

    const url = (body?.url ?? "").toString().trim();

    const courseIdRaw =
      typeof body.course_id === "string" ? body.course_id.trim() : null;
    const teamNameRaw =
      typeof body.team_name === "string" ? body.team_name.trim() : null;
    const courseIdVal = courseIdRaw || null;
    const teamNameVal = teamNameRaw || null;

    // Reject unknown course IDs — only allow-listed sections may tag submissions.
    // Submissions with no course_id (plain /analyze usage) pass through unchanged.
    if (courseIdVal !== null && !ALLOWED_COURSE_IDS.has(courseIdVal)) {
      return NextResponse.json(
        {
          error: `"${courseIdVal}" is not a recognised course section. Check the link you were given and try again.`,
          status: "failed",
          code: "invalid_course_id",
        },
        { status: 400 },
      );
    }

    const ghName =
      (typeof authUser.user_metadata?.user_name === "string"
        ? authUser.user_metadata.user_name.trim()
        : "") ||
      (typeof authUser.user_metadata?.preferred_username === "string"
        ? authUser.user_metadata.preferred_username.trim()
        : "");
    const githubLogin: string | null = ghName || null;

    if (!url) {
      return NextResponse.json(
        { error: "Missing url. Provide { url: string }." },
        { status: 400 },
      );
    }

    if (!isValidGitHubUrl(url)) {
      return NextResponse.json(
        { error: "Invalid GitHub URL. Use https://github.com/owner/repo or a pull request URL." },
        { status: 400 },
      );
    }

    const normalizedUrl = normalizeGitHubUrl(url);
    const analyzeRef: AnalyzeRef | undefined = parseAnalyzeRef(body?.ref);

    const baseCache = path.join(os.tmpdir(), "repo-metrics-git-cache");
    const cacheDir =
      userId && githubToken ? path.join(baseCache, "u", userId) : baseCache;

    const report = await analyzeFromGitHubUrl(normalizedUrl, {
      useCache: true,
      cacheDir,
      githubToken,
      ref: analyzeRef,
    });

    const parsed = parseGitHubUrl(normalizedUrl);
    const commitSha = report.source?.commit ?? null;

    let resultId: string;
    if (parsed) {
      resultId = buildAnalysisResultId({
        owner: parsed.owner,
        repo: parsed.repo,
        commitSha,
        ref: analyzeRef,
        scope: report.source?.scope,
        prNumber: report.source?.prNumber,
      });
    } else {
      resultId = randomUUID();
    }

    const submissionPayload = {
      course_id: courseIdVal,
      team_name: teamNameVal,
      github_login: githubLogin,
    };
    const persistedReport = reportWithSubmission(report, submissionPayload);

    if (process.env.NODE_ENV === "development") {
      console.log("[analyze] Generated resultId:", resultId, "commitSha:", commitSha);
    }

    if (isSupabaseConfigured()) {
      const row = {
        result_id: resultId,
        repo_url: normalizedUrl,
        commit_sha: commitSha,
        report_json: reportAsJsonObject(persistedReport),
        user_id: userId,
        course_id: courseIdVal,
        team_name: teamNameVal,
        github_login: githubLogin,
      };

      const { error } = await getSupabase()
        .from("analyses")
        .upsert(row, { onConflict: "result_id" });

      if (error) {
        console.error("[analyze] Supabase upsert failed:", error);
        const schemaStale = analysesUpsertLooksLikeStaleSchema(error);
        const respBody: Record<string, unknown> = {
          error: schemaStale
            ? "Could not save the report: database is missing newer columns."
            : "Failed to save result.",
          status: "failed",
        };
        if (schemaStale) {
          respBody.code = "analyses_schema_mismatch";
          respBody.hint = ANALYSES_MIGRATION_HINT;
        }
        if (process.env.NODE_ENV === "development") {
          respBody.debug = {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          };
          if (
            schemaStale ||
            (error.code === "PGRST204" &&
              String(error.message).includes("user_id"))
          ) {
            respBody.hintDeveloper =
              "Run supabase/migrations in order or paste supabase/run_in_dashboard_sql_editor.sql into the Supabase SQL Editor.";
          }
        }
        return NextResponse.json(respBody, {
          status: schemaStale ? 503 : 500,
        });
      }
    } else if (isDevReportMemoryFallback()) {
      devStoreReport(resultId, persistedReport as unknown as DashboardRepoReport);
      console.warn(
        "[analyze] Supabase not configured; result kept in server memory (dev only).",
      );
    } else {
      return NextResponse.json(
        {
          error:
            "Supabase is not configured. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY on the server (see .env.example), then redeploy.",
          status: "failed",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "done",
      resultId,
      course_id: courseIdVal,
      report: persistedReport,
    });
  } catch (err) {
    console.error("[analyze]", err);
    const message = err instanceof Error ? err.message : "Analysis failed.";
    const clientMessage =
      process.env.NODE_ENV === "production" ? "Analysis failed." : message;
    return NextResponse.json(
      { error: clientMessage, status: "failed" },
      { status: 500 },
    );
  }
}
