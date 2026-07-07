/**
 * GET /api/results/[id]
 * Returns a persisted analysis result by ID from Supabase.
 * Includes retry logic to handle race conditions (Supabase replication delay).
 * @see Story 4.2
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSupabase,
  isDevReportMemoryFallback,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  createUserSupabaseServerClient,
  isUserSupabaseConfigured,
} from "@/lib/supabase/server-user";
import { devGetReport } from "@/lib/devReportStore";
import { analysisResultIdLookupIds } from "@/lib/buildAnalysisResultId";
import type { SupabaseClient } from "@supabase/supabase-js";

const isDev = process.env.NODE_ENV === "development";

/** Avoid broad prefix scans on very short strings (IDs are user-owner-repo-commit, typically longer). */
const MIN_PARTIAL_RESULT_ID_LENGTH = 20;

async function fetchReportByExactId(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<{ report_json: unknown; result_id: string } | null> {
  const { data, error } = await supabase
    .from("analyses")
    .select("report_json, result_id")
    .eq("result_id", candidateId)
    .single();

  if (data && !error) {
    return data;
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const trimmedId = id.trim();
  if (isDev) {
    console.log("[results] GET request for result_id:", trimmedId);
  }

  try {
    if (isDevReportMemoryFallback()) {
      const report = devGetReport(trimmedId);
      if (report) {
        return NextResponse.json(report);
      }
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    const useRlsClient =
      isSupabaseConfigured() && isUserSupabaseConfigured();
    const supabase = useRlsClient
      ? await createUserSupabaseServerClient()
      : getSupabase();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const lookupIds = analysisResultIdLookupIds(user?.id ?? null, trimmedId);

    // Retry logic to handle race condition (Supabase replication delay)
    const maxRetries = 3;
    const retryDelay = 500; // ms
    let data: { report_json: unknown; result_id: string } | null = null;
    let error: { message: string; code?: string; details?: string } | null =
      null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      for (const candidateId of lookupIds) {
        const match = await fetchReportByExactId(supabase, candidateId);
        if (match) {
          data = match;
          error = null;
          break;
        }
      }

      if (data) {
        if (isDev) {
          console.log(`[results] Found on attempt ${attempt}`);
        }
        return NextResponse.json(data.report_json);
      }

      error = { message: "Result not found" };

      // If not found and not last attempt, wait and retry
      if (attempt < maxRetries) {
        if (isDev) {
          console.log(
            `[results] Not found on attempt ${attempt}, retrying in ${retryDelay * attempt}ms...`,
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * attempt),
        );
      }
    }

    // If still not found after retries, try prefix match only for sufficiently long ids (RLS still applies).
    if ((error || !data) && trimmedId.length >= MIN_PARTIAL_RESULT_ID_LENGTH) {
      if (isDev) {
        console.log(
          "[results] Exact match failed after retries, trying partial match",
        );
      }
      const { data: partialData, error: partialError } = await supabase
        .from("analyses")
        .select("report_json, result_id")
        .like("result_id", `${trimmedId}%`)
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!partialError && partialData) {
        if (isDev) {
          console.log("[results] Found via partial match:", partialData.result_id);
        }
        return NextResponse.json(partialData.report_json);
      }
    }

    // Final error handling
    if (error) {
      console.error("[results] Supabase error:", error.message, error.code, error.details);
      if (isDev) {
        const { data: all } = await supabase
          .from("analyses")
          .select("result_id")
          .limit(10);
        if (isDev) {
          console.log(
            "[results] Available result_ids:",
            all?.map((r) => r.result_id),
          );
        }
        return NextResponse.json(
          {
            error: "Result not found",
            debug: { searched: trimmedId, available: all?.map((r) => r.result_id) },
          },
          { status: 404 },
        );
      }
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    if (!data) {
      if (isDev) {
        console.log("[results] No row found for id:", trimmedId);
      }
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    if (isDev) {
      console.log("[results] Found report for id:", trimmedId);
    }
    return NextResponse.json(data.report_json);
  } catch (err) {
    console.error("[results] Exception:", err);
    const body: { error: string; details?: string } = {
      error: "Failed to fetch result",
    };
    if (isDev) {
      body.details =
        err instanceof Error ? err.message : "Unknown error";
    }
    return NextResponse.json(body, { status: 500 });
  }
}
