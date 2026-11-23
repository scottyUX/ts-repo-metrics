import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/cse115a/benchmark/loadCourseBenchmark";
import { SNAPSHOT_SLOT_PATHS, slotsFromSnapshotPaths, snapshotSlotPathValues } from "@/lib/cse115a/gradeReview";
import { graderStats, type GraderStats, type SeenAiGrade } from "@/lib/cse115a/graderStats";

/** Submission ids per grade query, so the `in` list stays a short URL. */
const ID_CHUNK = 100;

type SubmissionRow = { id: string; assignment_number: number; submitted_at: string; superseded_at: string | null } & Record<string, unknown>;
type GradeRow = {
  assignment_submission_id: string; task_slot: number; rubric: unknown; agent_total: number | string; model: string; prompt_version: string;
  graded_at: string; instructor_rubric: unknown; instructor_total: number | string | null; released_at: string | null;
  instructor_saved_at: string | null; instructor_saw_graded_at: string | null;
};
type HistoryRow = {
  assignment_submission_id: string; task_slot: number; rubric: unknown; agent_total: number | string; model: string; prompt_version: string; graded_at: string;
};

const GRADE_COLUMNS = "assignment_submission_id,task_slot,rubric,agent_total,model,prompt_version,graded_at,instructor_rubric,instructor_total,released_at,instructor_saved_at,instructor_saw_graded_at";
const HISTORY_COLUMNS = "assignment_submission_id,task_slot,rubric,agent_total,model,prompt_version,graded_at";

/** A released task whose recorded staff save saw an AI grade other than the newest needs that grade from the history (#429). */
const needsSeen = (grade: GradeRow) => Boolean(grade.released_at && grade.instructor_saved_at && grade.instructor_saw_graded_at)
  && Date.parse(grade.instructor_saw_graded_at!) !== Date.parse(grade.graded_at);
const historyKey = (submissionId: string, slot: number, gradedAt: string) => `${submissionId}|${slot}|${Date.parse(gradedAt)}`;

/**
 * Reads one course's final submissions and their grade rows, every page of each, and returns graderStats' numbers:
 * counts, and for the tasks staff changed the submission id and task slot (#432), which the Grader page links to.
 * `cse_task_grades` has no course column, so the course's submissions come first. History entries
 * (`cse_task_ai_grades`) are read only for released tasks whose recorded staff save saw an older AI grade (#429).
 */
export async function loadGraderStats(db: SupabaseClient, courseId: string): Promise<GraderStats> {
  const submissions = await allRows<SubmissionRow>((from, to) => db.from("cse_assignment_submissions")
    .select<string, SubmissionRow>(`id,assignment_number,submitted_at,superseded_at,${SNAPSHOT_SLOT_PATHS}`)
    .eq("course_id", courseId).order("id").range(from, to));
  const grades: GradeRow[] = [];
  const ids = submissions.map((row) => row.id);
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    grades.push(...await allRows<GradeRow>((from, to) => db.from("cse_task_grades")
      .select<string, GradeRow>(GRADE_COLUMNS).in("assignment_submission_id", chunk).order("assignment_submission_id").order("task_slot").range(from, to)));
  }
  // The AI grades staff saw, from the history, only for the submissions that need one.
  const seen = new Map<string, SeenAiGrade>();
  const seenIds = [...new Set(grades.filter(needsSeen).map((grade) => grade.assignment_submission_id))];
  for (let index = 0; index < seenIds.length; index += ID_CHUNK) {
    const chunk = seenIds.slice(index, index + ID_CHUNK);
    const rows = await allRows<HistoryRow>((from, to) => db.from("cse_task_ai_grades")
      .select<string, HistoryRow>(HISTORY_COLUMNS).in("assignment_submission_id", chunk)
      .order("assignment_submission_id").order("task_slot").order("graded_at").range(from, to));
    for (const row of rows) {
      seen.set(historyKey(row.assignment_submission_id, row.task_slot, row.graded_at),
        { rubric: row.rubric, agentTotal: row.agent_total, model: row.model, promptVersion: row.prompt_version, gradedAt: row.graded_at });
    }
  }
  const byId = new Map(submissions.map((row) => [row.id, row]));
  return graderStats({
    submissions: submissions.map((row) => ({
      key: row.id,
      assignmentNumber: row.assignment_number,
      submittedAt: row.submitted_at,
      superseded: row.superseded_at !== null,
      taskCount: slotsFromSnapshotPaths(...snapshotSlotPathValues(row)).length,
    })),
    grades: grades.flatMap((grade) => {
      const submission = byId.get(grade.assignment_submission_id);
      if (!submission) return [];
      return [{
        submissionKey: grade.assignment_submission_id,
        taskSlot: grade.task_slot,
        assignmentNumber: submission.assignment_number,
        submittedAt: submission.submitted_at,
        superseded: submission.superseded_at !== null,
        rubric: grade.rubric,
        agentTotal: grade.agent_total,
        model: grade.model,
        promptVersion: grade.prompt_version,
        gradedAt: grade.graded_at,
        instructorRubric: grade.instructor_rubric,
        instructorTotal: grade.instructor_total,
        releasedAt: grade.released_at,
        instructorSavedAt: grade.instructor_saved_at ?? null,
        instructorSawGradedAt: grade.instructor_saw_graded_at ?? null,
        seen: needsSeen(grade) ? seen.get(historyKey(grade.assignment_submission_id, grade.task_slot, grade.instructor_saw_graded_at!)) ?? null : null,
      }];
    }),
  });
}
