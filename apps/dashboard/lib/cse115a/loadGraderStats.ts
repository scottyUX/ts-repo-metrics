import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/cse115a/benchmark/loadCourseBenchmark";
import { SNAPSHOT_SLOT_PATHS, slotsFromSnapshotPaths, snapshotSlotPathValues } from "@/lib/cse115a/gradeReview";
import { graderStats, type GraderStats } from "@/lib/cse115a/graderStats";

/** Submission ids per grade query, so the `in` list stays a short URL. */
const ID_CHUNK = 100;

type SubmissionRow = { id: string; assignment_number: number; submitted_at: string; superseded_at: string | null } & Record<string, unknown>;
type GradeRow = {
  assignment_submission_id: string; rubric: unknown; agent_total: number | string; model: string; prompt_version: string;
  graded_at: string; instructor_rubric: unknown; instructor_total: number | string | null; released_at: string | null;
};

const GRADE_COLUMNS = "assignment_submission_id,rubric,agent_total,model,prompt_version,graded_at,instructor_rubric,instructor_total,released_at";

/**
 * Reads one course's final submissions and their grade rows, every page of each, and returns only graderStats'
 * counts. `cse_task_grades` has no course column, so the course's submissions come first.
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
      }];
    }),
  });
}
