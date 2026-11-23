// The database side of staff choosing a task's code PR (#431, workPrChoice.ts), on the service-role Supabase
// client: the staff re-capture's store (recaptureStore.ts) for every write, plus the course's tasks for the "used by
// another task" rule. The snapshots are read as JSON paths, so no diff is loaded.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_EXTRA_CODE_PRS } from "@/lib/cse115a/submissionSnapshot";
import { TASK_SLOTS } from "@/lib/cse115a/taskSlots";
import { supabaseRecaptureDb } from "./recaptureStore";
import type { CourseTaskRef, WorkPrDb } from "./workPrChoice";

/** The positions of a task's extra PRs (#437): 0 to MAX_EXTRA_CODE_PRS - 1. */
const EXTRA_INDEXES = Array.from({ length: MAX_EXTRA_CODE_PRS }, (_, index) => index);

/**
 * Each task's slot, repository, PR and task-file PR as JSON paths: `s1`, `r1`, `p1`, `f1` for the first task, and so
 * on; and (#437) the number of each of its extra PRs, `x1_0`, `x1_1`, `x1_2`, so no diff is loaded.
 */
export const WORK_PR_TASK_PATHS = TASK_SLOTS.map((slot) => {
  const at = `snapshot->tasks->${slot - 1}`;
  const extras = EXTRA_INDEXES.map((index) => `x${slot}_${index}:${at}->extraCodePrs->${index}->prNumber`).join(",");
  return `s${slot}:${at}->slot,r${slot}:${at}->repoFullName,p${slot}:${at}->prNumber,f${slot}:${at}->taskFilePr->number,${extras}`;
}).join(",");

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** The task refs of one submission row listed with WORK_PR_TASK_PATHS. */
export function submissionTaskRefs(row: Record<string, unknown>): CourseTaskRef[] {
  const out: CourseTaskRef[] = [];
  for (const slot of TASK_SLOTS) {
    const taskSlot = num(row[`s${slot}`]);
    const repo = row[`r${slot}`];
    const pr = num(row[`p${slot}`]);
    if (taskSlot === null || typeof repo !== "string" || pr === null) continue;
    const extras = EXTRA_INDEXES.map((index) => num(row[`x${slot}_${index}`])).filter((n): n is number => n !== null);
    out.push({
      source: "submission", submissionId: String(row.id), userId: String(row.user_id), assignmentNumber: Number(row.assignment_number),
      slot: taskSlot, repoFullName: repo, prNumber: pr, taskFilePrNumber: num(row[`f${slot}`]),
      ...(extras.length ? { extraPrNumbers: extras } : {}),
    });
  }
  return out;
}

export function supabaseWorkPrDb(db: SupabaseClient): WorkPrDb {
  return {
    ...supabaseRecaptureDb(db),
    async loadCourseTaskRefs(courseId, repoFullName) {
      // The ilike on the task rows only narrows them; usedBy compares exactly, as the students' duplicate check.
      const [submissions, rows] = await Promise.all([
        db.from("cse_assignment_submissions").select(`id,user_id,assignment_number,${WORK_PR_TASK_PATHS}`)
          .eq("course_id", courseId).is("superseded_at", null),
        db.from("cse_task_submissions").select("user_id,assignment_number,task_slot,repo_full_name,pr_number,pair:facts_json->taskFilePr->number")
          .eq("course_id", courseId).ilike("repo_full_name", repoFullName),
      ]);
      if (submissions.error) throw new Error(`Could not read the course's submissions: ${submissions.error.message}`);
      if (rows.error) throw new Error(`Could not read the course's tasks: ${rows.error.message}`);
      const refs = ((submissions.data ?? []) as unknown as Array<Record<string, unknown>>).flatMap(submissionTaskRefs);
      for (const row of (rows.data ?? []) as unknown as Array<Record<string, unknown>>) {
        const pr = num(row.pr_number);
        if (pr === null || typeof row.repo_full_name !== "string") continue;
        refs.push({
          source: "task_row", submissionId: null, userId: String(row.user_id), assignmentNumber: Number(row.assignment_number),
          slot: Number(row.task_slot), repoFullName: row.repo_full_name, prNumber: pr, taskFilePrNumber: num(row.pair),
        });
      }
      return refs;
    },
    async repoCopyStored(instanceId, baseCommit) {
      // Loaded here, not at the top: repoCopyAccess is server-only, and the pure helpers above are tested without it.
      const { findRepoCopy, supabaseCopyFiles } = await import("@/lib/cse115a/repoCopyAccess");
      const files = supabaseCopyFiles();
      if (!files) return null;
      try {
        const copy = await findRepoCopy(files, instanceId, baseCommit);
        return copy.stored && copy.complete;
      } catch {
        return null;
      }
    },
  };
}
