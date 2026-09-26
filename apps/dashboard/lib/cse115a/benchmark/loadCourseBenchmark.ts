import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BenchmarkInstance } from "./buildInstance";
import type { ExportCandidate } from "./exportJsonl";
import { countsAsConsent } from "@/lib/cse115a/consent";

const PAGE = 500;

export type SourceRow = {
  instance_id: string;
  user_id: string;
  assignment_submission_id: string;
  task_slot: number;
  validation_status: "candidate" | "validated" | "rejected";
  flags: string[];
  created_at: string;
};

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** A course's benchmark sources with each student's current consent. */
export async function loadCourseSources(db: SupabaseClient, courseId: string) {
  const [sources, consent] = await Promise.all([
    allRows<SourceRow>((from, to) => db.from("cse_benchmark_task_sources")
      .select("instance_id,user_id,assignment_submission_id,task_slot,validation_status,flags,created_at")
      .eq("course_id", courseId).order("created_at").range(from, to)),
    allRows<{ user_id: string; consented: boolean; consent_version: string }>((from, to) => db.from("cse_research_consent")
      .select("user_id,consented,consent_version").eq("course_id", courseId).range(from, to)),
  ]);
  // Only a yes to the current, approved wording counts.
  const consented = new Set(consent.filter(countsAsConsent).map((row) => row.user_id));
  return { sources, consented };
}

/** Candidates for JSONL export: every instance with its sources in this course. */
export async function loadExportCandidates(db: SupabaseClient, courseId: string): Promise<ExportCandidate[]> {
  const { sources, consented } = await loadCourseSources(db, courseId);
  const ids = [...new Set(sources.map((row) => row.instance_id))];
  const instances: BenchmarkInstance[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await db.from("cse_benchmark_tasks").select("*").in("instance_id", ids.slice(index, index + 100));
    if (error) throw new Error(error.message);
    instances.push(...(data as BenchmarkInstance[]));
  }
  return instances.map((instance) => ({
    instance,
    sources: sources.filter((row) => row.instance_id === instance.instance_id)
      .map((row) => ({ consented: consented.has(row.user_id), validationStatus: row.validation_status })),
  }));
}
