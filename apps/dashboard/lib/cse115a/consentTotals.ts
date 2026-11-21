import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_VERSION } from "@/lib/cse115a/consent";
import { allRows } from "@/lib/cse115a/benchmark/loadCourseBenchmark";

/** Research consent totals for one course. Counts only: nothing here names or identifies a student. */
export type ConsentTotals = { enrolled: number; yes: number; no: number; notAnswered: number };

/**
 * Counts enrolled students by their answer to the current wording. An answer to an older version,
 * or from someone no longer enrolled, is not counted as an answer.
 */
export function consentTotals(memberIds: readonly string[], answers: ReadonlyArray<{ user_id: string; consented: boolean; consent_version: string }>): ConsentTotals {
  const enrolled = new Set(memberIds);
  let yes = 0;
  let no = 0;
  for (const answer of answers) {
    if (!enrolled.has(answer.user_id) || answer.consent_version !== CONSENT_VERSION) continue;
    if (answer.consented) yes += 1; else no += 1;
  }
  return { enrolled: enrolled.size, yes, no, notAnswered: enrolled.size - yes - no };
}

/** Loads a course's memberships and consent answers and returns only the totals. */
export async function loadConsentTotals(db: SupabaseClient, courseId: string): Promise<ConsentTotals> {
  const [members, answers] = await Promise.all([
    allRows<{ user_id: string }>((from, to) => db.from("cse_course_memberships")
      .select("user_id").eq("course_id", courseId).range(from, to)),
    allRows<{ user_id: string; consented: boolean; consent_version: string }>((from, to) => db.from("cse_research_consent")
      .select("user_id,consented,consent_version").eq("course_id", courseId).range(from, to)),
  ]);
  return consentTotals(members.map((row) => row.user_id), answers);
}
