/**
 * Server-only: fetches a report by resultId from Supabase (or dev memory fallback).
 * Used by the results page to avoid HTTP fetch issues.
 */

import {
  getSupabase,
  isDevReportMemoryFallback,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  createUserSupabaseServerClient,
  isUserSupabaseConfigured,
} from "@/lib/supabase/server-user";
import { analysisResultIdLookupIds } from "@/lib/buildAnalysisResultId";
import { devGetReport } from "@/lib/devReportStore";
import type { RepoReport } from "@/lib/reportTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_RETRIES = 3;
const RETRY_DELAY = 500;

async function fetchReportJsonByExactId(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<RepoReport | null> {
  const { data, error } = await supabase
    .from("analyses")
    .select("report_json")
    .eq("result_id", candidateId)
    .single();

  if (data && !error) {
    return data.report_json as RepoReport;
  }
  return null;
}

export async function getReportById(id: string): Promise<{
  data: RepoReport | null;
  error: string | null;
}> {
  const trimmedId = id.trim();

  try {
    if (isDevReportMemoryFallback()) {
      const mem = devGetReport(trimmedId);
      if (mem) return { data: mem, error: null };
      return { data: null, error: "Result not found" };
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

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      for (const candidateId of lookupIds) {
        const report = await fetchReportJsonByExactId(supabase, candidateId);
        if (report) {
          return { data: report, error: null };
        }
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY * attempt));
      }
    }

    const { data: partial } = await supabase
      .from("analyses")
      .select("report_json")
      .like("result_id", `${trimmedId}%`)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (partial) {
      return { data: partial.report_json as RepoReport, error: null };
    }

    return { data: null, error: "Result not found" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { data: null, error: msg };
  }
}
