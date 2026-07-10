/**
 * POST /api/ai-usage
 * Persists the current user's AI usage CSV for an existing analysis result.
 * Inserts a new row into ai_usage_csvs (result_id, user_id, version) for every
 * upload rather than overwriting the last one, so prior versions are kept.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  isDevReportMemoryFallback,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  createUserSupabaseServerClient,
  isUserSupabaseConfigured,
} from "@/lib/supabase/server-user";
import { ANALYZE_SIGN_IN_REQUIRED_MESSAGE } from "@/lib/analyzeConstants";
import { devStoreAiUsageCsv } from "@/lib/devAiUsageStore";
import { userScopedResultId } from "@/lib/buildAnalysisResultId";
import { resolveAnalysisRow } from "@/lib/resolveAnalysisRow";

const AI_USAGE_RESOLVE_OPTIONS = { preferUserScope: true } as const;

const AI_USAGE_MIGRATION_HINT =
  "Run supabase/migrations/20260709000000_ai_usage_csvs_versioning.sql in the Supabase SQL Editor.";

function aiUsageCsvsTableMissing(error: {
  message?: string;
  code?: string | null;
}): boolean {
  return (
    error.code === "42P01" || /\bai_usage_csvs\b/i.test(error.message ?? "")
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!isUserSupabaseConfigured()) {
      return NextResponse.json(
        {
          error:
            "Sign-in is not configured for this deployment. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
          code: "auth_unavailable",
        },
        { status: 503 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const resultId =
      typeof body.resultId === "string" ? body.resultId.trim() : "";
    const csvText = typeof body.csvText === "string" ? body.csvText : "";

    if (!resultId) {
      return NextResponse.json(
        {
          error:
            "Missing resultId. Provide { resultId: string, csvText: string }.",
        },
        { status: 400 },
      );
    }

    if (!csvText.trim()) {
      return NextResponse.json(
        { error: "Missing csvText. Upload a non-empty CSV file." },
        { status: 400 },
      );
    }

    const userSb = await createUserSupabaseServerClient();
    const {
      data: { user },
    } = await userSb.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: ANALYZE_SIGN_IN_REQUIRED_MESSAGE,
          code: "sign_in_required",
        },
        { status: 401 },
      );
    }

    let savedResultId = resultId;

    if (isSupabaseConfigured()) {
      const resolved = await resolveAnalysisRow(
        resultId,
        userSb,
        AI_USAGE_RESOLVE_OPTIONS,
      );
      if (!resolved.ok) {
        return NextResponse.json(
          { error: "Analysis not found for this result.", code: "not_found" },
          { status: 404 },
        );
      }

      savedResultId = resolved.resultId;

      // Insert a new version into the per-user table. RLS enforces
      // user_id = auth.uid(); the DB trigger assigns the next version number
      // for this (result_id, user_id) pair, so prior uploads are never lost.
      const { error: insertError } = await userSb
        .from("ai_usage_csvs")
        .insert({
          result_id: savedResultId,
          user_id: user.id,
          csv_text: csvText,
        });

      if (insertError) {
        if (aiUsageCsvsTableMissing(insertError)) {
          return NextResponse.json(
            {
              error:
                "Could not save AI usage CSV: database is missing ai_usage_csvs table.",
              code: "analyses_schema_mismatch",
              hint: AI_USAGE_MIGRATION_HINT,
            },
            { status: 503 },
          );
        }
        return NextResponse.json(
          { error: "Failed to save AI usage CSV." },
          { status: 500 },
        );
      }
    } else if (isDevReportMemoryFallback()) {
      const scopedResultId = userScopedResultId(user.id, resultId);
      devStoreAiUsageCsv(user.id, scopedResultId, csvText);
      savedResultId = scopedResultId;
    } else {
      return NextResponse.json(
        { error: "Storage is not configured." },
        { status: 503 },
      );
    }

    return NextResponse.json({ resultId: savedResultId, csvText });
  } catch (err) {
    console.error("[ai-usage]", err instanceof Error ? err.message : err);
    const message =
      process.env.NODE_ENV === "production"
        ? "Failed to save AI usage CSV."
        : err instanceof Error
          ? err.message
          : "Failed to save AI usage CSV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
