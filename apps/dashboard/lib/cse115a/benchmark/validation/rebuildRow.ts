// Rebuilds a benchmark row from its PR's merge commit, for rows whose captured diff is wrong because
// of how the student tagged or stacked their work (a base tag on the commit that holds the spec and
// all the code, so the captured patch is empty). Staff-side only: the student's repository, tags and
// grade are untouched. Rule: for merge commit M, base_commit = M^1 (first parent; also right for a
// squash or rebase merge, which has one parent) and the change is `git diff M^1 M`. The sprint's
// task file (docs/tasks/sprint-N/<id>.md, `isTaskFilePath`) is dropped, and the rest goes through
// the app's own buildInstance, so the split, the scrubbing of personal data and the static
// FAIL_TO_PASS are exactly what capture would have produced. Pure except for the git calls.
// Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "Rebuilt rows".

import { createHash } from "node:crypto";
import { buildInstance, type BuildFlag } from "@/lib/cse115a/benchmark/buildInstance";
import { parseDiffFiles } from "@/lib/cse115a/diff";
import type { SubmissionSnapshot, TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import { isTaskFilePath } from "@/lib/cse115a/taskSpec";
import type { TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";

/** The flag write-back adds to a rebuilt row's source, so the change can be found and reverted. */
export const STAFF_REBUILT_FLAG = "staff_rebuilt:merge-parent";

/** Where a rebuilt row came from and what it replaced. Travels on the row and into its result. */
export type RebuildProvenance = {
  rebuilt_from: "merge-parent";
  merge_commit: string;
  original_base_commit: string;
  /** sha256 of the student-captured patch and test_patch, so a revert can be checked. */
  original_patch_sha256: string;
  original_test_patch_sha256: string;
};

/** Runs `git <args>` in the clone and returns stdout. */
export type GitRunner = (args: string[]) => Promise<string>;

export type RebuildInput = {
  /** The row as captured; every field it has is kept except the ones rebuilt. */
  row: TaskRow & Record<string, unknown>;
  /** The task from the submission snapshot the row was captured from. */
  task: TaskSnapshot;
  assignmentNumber: number;
  /** The submitting student's UCSC email, as capture uses it for scrubbing. */
  studentEmail: string | null;
  git: GitRunner;
  /** When given, the snapshot's PR number must match (a cross-check against the wrong task). */
  expectedPr?: number;
};

export type RebuiltRow = TaskRow & Record<string, unknown> & { rebuild: RebuildProvenance };

/** The slice of the Supabase client loadRebuildSource reads through, so a test can hand in a fake. */
export type RebuildSourceClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<{ data: unknown; error: { message: string } | null }> & {
        eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }> };
      };
    };
  };
};

/** What a rebuild needs from the database: the captured task, its sprint, and the student's email for scrubbing. */
export type RebuildSource = { task: TaskSnapshot; assignmentNumber: number; attempt: number; studentEmail: string | null };

type StoredSourceRow = {
  task_slot: number;
  course_id: string;
  user_id: string;
  cse_assignment_submissions: { assignment_number: number; attempt: number; superseded_at: string | null; snapshot: SubmissionSnapshot } | null;
};

/**
 * Reads the submission an instance was captured from (read-only): the current attempt, else the
 * latest one; the task in its slot; and the student's UCSC email, as capture uses them.
 */
export async function loadRebuildSource(db: RebuildSourceClient, instanceId: string): Promise<RebuildSource> {
  const { data, error } = await db.from("cse_benchmark_task_sources")
    .select("task_slot,course_id,user_id,cse_assignment_submissions!inner(assignment_number,attempt,superseded_at,snapshot)")
    .eq("instance_id", instanceId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  const sources = ((data ?? []) as StoredSourceRow[])
    .filter((s): s is StoredSourceRow & { cse_assignment_submissions: NonNullable<StoredSourceRow["cse_assignment_submissions"]> } => s.cse_assignment_submissions != null)
    .sort((a, b) => Number(a.cse_assignment_submissions.superseded_at != null) - Number(b.cse_assignment_submissions.superseded_at != null)
      || b.cse_assignment_submissions.attempt - a.cse_assignment_submissions.attempt);
  const source = sources[0];
  if (!source) throw new Error(`${instanceId}: no cse_benchmark_task_sources row with a submission`);
  const submission = source.cse_assignment_submissions;
  const task = submission.snapshot.tasks.find((t) => t.slot === source.task_slot);
  if (!task) throw new Error(`${instanceId}: the submission snapshot has no task in slot ${source.task_slot}`);
  const member = await db.from("cse_course_memberships").select("ucsc_email").eq("course_id", source.course_id).eq("user_id", source.user_id).maybeSingle();
  if (member.error) throw new Error(`Supabase: ${member.error.message}`);
  const studentEmail = (member.data as { ucsc_email?: string } | null)?.ucsc_email ?? null;
  return { task, assignmentNumber: submission.assignment_number, attempt: submission.attempt, studentEmail };
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export async function rebuildRow(input: RebuildInput): Promise<{ row: RebuiltRow; flags: BuildFlag[]; droppedFiles: string[] }> {
  const { row, task } = input;
  if (input.expectedPr != null && task.prNumber !== input.expectedPr) {
    throw new Error(`${row.instance_id}: the snapshot's task is PR #${task.prNumber}, not #${input.expectedPr}`);
  }
  const merge = task.pr.mergeCommitSha;
  if (!merge) throw new Error(`${row.instance_id}: the snapshot has no merge commit`);
  const parent = (await input.git(["rev-parse", `${merge}^1`])).trim();
  const diff = await input.git(["diff", "--no-color", "--no-ext-diff", parent, merge]);

  const files = parseDiffFiles(diff);
  const dropped = files.filter((f) => isTaskFilePath(f.path, input.assignmentNumber));
  const kept = files.filter((f) => !dropped.includes(f)).map((f) => f.text).join("");

  const { instance, flags } = buildInstance(
    { ...task, baseCommit: parent, diff: kept, diffBytes: Buffer.byteLength(kept, "utf8"), diffTruncated: false, diffError: null },
    input.assignmentNumber, null, input.studentEmail,
  );
  return {
    row: {
      ...row,
      base_commit: parent,
      environment_setup_commit: parent,
      patch: instance.patch,
      test_patch: instance.test_patch,
      FAIL_TO_PASS: instance.FAIL_TO_PASS,
      PASS_TO_PASS: [],
      rebuild: {
        rebuilt_from: "merge-parent",
        merge_commit: merge,
        original_base_commit: row.base_commit,
        original_patch_sha256: sha256(row.patch ?? ""),
        original_test_patch_sha256: sha256(row.test_patch ?? ""),
      },
    },
    // The base-commit flags describe how capture chose its base; a rebuilt row's base is M^1.
    flags: flags.filter((f) => !f.startsWith("base_commit_from_")),
    droppedFiles: dropped.map((f) => f.path),
  };
}
