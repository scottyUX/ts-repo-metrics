/**
 * Resolve an analyses row by result_id with retry + prefix match (matches results API).
 * Uses the caller's Supabase client (typically user RLS) — visibility is enforced by RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AnalysisResultIdLookupOptions,
  analysisResultIdLookupIds,
} from "@/lib/buildAnalysisResultId";

export const ANALYSIS_ROW_MAX_RETRIES = 3;
export const ANALYSIS_ROW_RETRY_DELAY_MS = 500;
export const MIN_PARTIAL_RESULT_ID_LENGTH = 20;

export type ResolveAnalysisRowResult =
  | { ok: true; resultId: string }
  | { ok: false; code: "not_found" };

async function fetchExactResultId(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("analyses")
    .select("result_id")
    .eq("result_id", candidateId)
    .maybeSingle();

  if (data?.result_id && !error) {
    return data.result_id;
  }
  return null;
}

export async function resolveAnalysisRow(
  requestedId: string,
  supabase: SupabaseClient,
  options?: AnalysisResultIdLookupOptions,
): Promise<ResolveAnalysisRowResult> {
  const trimmedId = requestedId.trim();
  if (!trimmedId) {
    return { ok: false, code: "not_found" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const lookupIds = analysisResultIdLookupIds(
    user?.id ?? null,
    trimmedId,
    options,
  );

  for (let attempt = 1; attempt <= ANALYSIS_ROW_MAX_RETRIES; attempt++) {
    for (const candidateId of lookupIds) {
      const resultId = await fetchExactResultId(supabase, candidateId);
      if (resultId) {
        return { ok: true, resultId };
      }
    }

    if (attempt < ANALYSIS_ROW_MAX_RETRIES) {
      await new Promise((r) =>
        setTimeout(r, ANALYSIS_ROW_RETRY_DELAY_MS * attempt),
      );
    }
  }

  if (trimmedId.length >= MIN_PARTIAL_RESULT_ID_LENGTH) {
    const prefixCandidates =
      options?.preferUserScope && user?.id
        ? !trimmedId.startsWith(`${user.id}-`)
          ? [`${user.id}-${trimmedId}`, trimmedId]
          : [trimmedId]
        : [trimmedId];

    for (const prefix of prefixCandidates) {
      const { data, error } = await supabase
        .from("analyses")
        .select("result_id")
        .like("result_id", `${prefix}%`)
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.result_id && !error) {
        return { ok: true, resultId: data.result_id };
      }
    }
  }

  return { ok: false, code: "not_found" };
}
