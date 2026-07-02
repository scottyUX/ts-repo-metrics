/**
 * Resolve an analyses row by result_id with retry + prefix match (matches results API).
 * Uses the caller's Supabase client (typically user RLS) — visibility is enforced by RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const ANALYSIS_ROW_MAX_RETRIES = 3;
export const ANALYSIS_ROW_RETRY_DELAY_MS = 500;
export const MIN_PARTIAL_RESULT_ID_LENGTH = 20;

export type ResolveAnalysisRowResult =
  | { ok: true; resultId: string }
  | { ok: false; code: "not_found" };

export async function resolveAnalysisRow(
  requestedId: string,
  supabase: SupabaseClient,
): Promise<ResolveAnalysisRowResult> {
  const trimmedId = requestedId.trim();
  if (!trimmedId) {
    return { ok: false, code: "not_found" };
  }

  for (let attempt = 1; attempt <= ANALYSIS_ROW_MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from("analyses")
      .select("result_id")
      .eq("result_id", trimmedId)
      .maybeSingle();

    if (data?.result_id && !error) {
      return { ok: true, resultId: data.result_id };
    }

    if (attempt < ANALYSIS_ROW_MAX_RETRIES) {
      await new Promise((r) =>
        setTimeout(r, ANALYSIS_ROW_RETRY_DELAY_MS * attempt),
      );
    }
  }

  if (trimmedId.length >= MIN_PARTIAL_RESULT_ID_LENGTH) {
    const { data, error } = await supabase
      .from("analyses")
      .select("result_id")
      .like("result_id", `${trimmedId}%`)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.result_id && !error) {
      return { ok: true, resultId: data.result_id };
    }
  }

  return { ok: false, code: "not_found" };
}
