import "server-only";
import { effectiveTotal } from "@/lib/cse115a/gradeReview";
import { teamLink } from "@/lib/cse115a/reviewText";
import { isTaskSlot, TASK_SLOTS } from "@/lib/cse115a/taskSlots";
import { MAX_EXTRA_CODE_PRS } from "@/lib/cse115a/submissionSnapshot";
import type { ExtraPrDetail, TaskDetail, TaskTableRow } from "./taskTable";

// The two staff routes behind the Benchmark page's task table (#444, #445). Both read; neither writes. The list
// reads small columns and JSON paths only: never `problem_statement`, `patch` or `test_patch`, never a diff, and never
// `cse_research_consent`. The detail route reads one task's spec and patches when a row is opened.

const PAGE = 500;
const CHUNK = 100;

/** The part of the Supabase client these loaders use, so a test can hand in a fake. */
export type TaskTableQuery = PromiseLike<{ data: unknown[] | null; error: unknown }> & {
  eq(column: string, value: unknown): TaskTableQuery;
  is(column: string, value: null): TaskTableQuery;
  in(column: string, values: unknown[]): TaskTableQuery;
  order(column: string): TaskTableQuery;
  range(from: number, to: number): TaskTableQuery;
};
export type TaskTableDb = { from(table: string): { select(columns: string): TaskTableQuery } };

/** The tables the list reads. The test checks consent is not among them. */
export const TASK_TABLE_TABLES = ["cse_benchmark_task_sources", "cse_assignment_submissions", "cse_benchmark_tasks", "cse_task_grades", "cse_course_memberships", "cse_course_roles"] as const;

async function pages(query: (from: number, to: number) => TaskTableQuery): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error("read failed");
    rows.push(...((data ?? []) as Array<Record<string, unknown>>));
    if (!data || data.length < PAGE) return rows;
  }
}

async function chunked(ids: string[], query: (chunk: string[]) => TaskTableQuery): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < ids.length; index += CHUNK) {
    const { data, error } = await query(ids.slice(index, index + CHUNK));
    if (error) throw new Error("read failed");
    rows.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  return rows;
}

/** Per snapshot task position: its slot, task id, title, repository, and each extra PR's number. Small paths only. */
export const TASK_TABLE_SNAPSHOT_PATHS = TASK_SLOTS.map((position) => [
  `slot_${position}:snapshot->tasks->${position - 1}->slot`,
  `task_${position}:snapshot->tasks->${position - 1}->>taskId`,
  `title_${position}:snapshot->tasks->${position - 1}->spec->>title`,
  `repo_${position}:snapshot->tasks->${position - 1}->>repoFullName`,
  ...Array.from({ length: MAX_EXTRA_CODE_PRS }, (_, extra) => `extra_${position}_${extra}:snapshot->tasks->${position - 1}->extraCodePrs->${extra}->prNumber`),
].join(",")).join(",");

/** The task table's small columns of `cse_benchmark_tasks`: no spec, no patches, and the report's date, not the report. */
export const TASK_TABLE_TASK_COLUMNS = [
  "instance_id", "FAIL_TO_PASS",
  "cov_status:validation_detail->fix_coverage->>status",
  "cov_covered:validation_detail->fix_coverage->lines_covered",
  "cov_executable:validation_detail->fix_coverage->lines_executable",
  "untested:validation_detail->untested_files",
  "gold:harbor_env->gold->>status",
  "report_files:repo_metrics->filesAnalyzed",
  "report_source:repo_metrics->source->>type",
  "report_date:repo_metrics->>analysis_timestamp",
].join(",");

const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

type SnapshotTask = { taskId: string | null; title: string | null; team: string | null; extraCodePrs: number };

/** The snapshot task in each slot, from the paths TASK_TABLE_SNAPSHOT_PATHS selected. */
export function snapshotTasksBySlot(row: Record<string, unknown>): Map<number, SnapshotTask> {
  const bySlot = new Map<number, SnapshotTask>();
  for (const position of TASK_SLOTS) {
    const slot = num(row[`slot_${position}`]);
    if (slot === null || !isTaskSlot(slot) || bySlot.has(slot)) continue;
    const extras = Array.from({ length: MAX_EXTRA_CODE_PRS }, (_, extra) => row[`extra_${position}_${extra}`]).filter((value) => num(value) !== null);
    bySlot.set(slot, {
      taskId: text(row[`task_${position}`]),
      title: text(row[`title_${position}`]),
      team: teamLink(row[`repo_${position}`])?.fullName ?? null,
      extraCodePrs: extras.length,
    });
  }
  return bySlot;
}

/** Whether the selected report paths show a stored report. */
function hasReport(task: Record<string, unknown> | undefined): boolean {
  return Boolean(task) && (task!.report_files !== null && task!.report_files !== undefined || text(task!.report_source) !== null || text(task!.report_date) !== null);
}

function status(value: unknown): TaskTableRow["validationStatus"] {
  return value === "validated" || value === "rejected" ? value : "candidate";
}

/**
 * One row per current task of the course: every benchmark source whose submission is the active attempt
 * (`superseded_at is null`), every assignment, newest submission first. Throws on a read error.
 */
export async function loadTaskTable(db: TaskTableDb, courseId: string): Promise<TaskTableRow[]> {
  const [submissions, sources, members, roles] = await Promise.all([
    pages((from, to) => db.from("cse_assignment_submissions").select(`id,user_id,assignment_number,submitted_at,${TASK_TABLE_SNAPSHOT_PATHS}`)
      .eq("course_id", courseId).is("superseded_at", null).order("id").range(from, to)),
    pages((from, to) => db.from("cse_benchmark_task_sources").select("id,instance_id,user_id,assignment_submission_id,task_slot,validation_status,flags")
      .eq("course_id", courseId).order("id").range(from, to)),
    pages((from, to) => db.from("cse_course_memberships").select("user_id,ucsc_email").eq("course_id", courseId).order("user_id").range(from, to)),
    pages((from, to) => db.from("cse_course_roles").select("email").eq("course_id", courseId).order("email").range(from, to)),
  ]);
  const current = new Map(submissions.map((row) => [String(row.id), row]));
  const listed = sources.filter((row) => current.has(String(row.assignment_submission_id)));
  const instanceIds = [...new Set(listed.map((row) => String(row.instance_id)))];
  const submissionIds = [...new Set(listed.map((row) => String(row.assignment_submission_id)))];
  const [tasks, grades] = await Promise.all([
    chunked(instanceIds, (chunk) => db.from("cse_benchmark_tasks").select(TASK_TABLE_TASK_COLUMNS).in("instance_id", chunk)),
    chunked(submissionIds, (chunk) => db.from("cse_task_grades").select("assignment_submission_id,task_slot,agent_total,instructor_total,released_at").in("assignment_submission_id", chunk)),
  ]);
  const taskBy = new Map(tasks.map((row) => [String(row.instance_id), row]));
  const gradeBy = new Map(grades.map((row) => [`${row.assignment_submission_id}:${row.task_slot}`, row]));
  const emailBy = new Map(members.map((row) => [String(row.user_id), String(row.ucsc_email ?? "")]));
  const staffEmails = new Set(roles.map((row) => String(row.email ?? "").toLowerCase()));
  const snapshotBy = new Map(submissions.map((row) => [String(row.id), snapshotTasksBySlot(row)]));

  const rows = listed.map((source): TaskTableRow => {
    const submission = current.get(String(source.assignment_submission_id))!;
    const slot = Number(source.task_slot);
    const snapshot = snapshotBy.get(String(submission.id))?.get(slot);
    const task = taskBy.get(String(source.instance_id));
    const grade = gradeBy.get(`${source.assignment_submission_id}:${slot}`);
    const email = emailBy.get(String(source.user_id)) ?? "";
    const coverageStatus = task?.cov_status;
    return {
      id: String(source.id),
      submissionId: String(submission.id),
      assignment: Number(submission.assignment_number),
      slot,
      team: snapshot?.team ?? null,
      email,
      staff: email !== "" && staffEmails.has(email.toLowerCase()),
      taskId: snapshot?.taskId ?? null,
      title: snapshot?.title ?? null,
      validationStatus: status(source.validation_status),
      flags: list(source.flags).map(String),
      provingTests: list(task?.FAIL_TO_PASS).length,
      coverage: coverageStatus === "measured" || coverageStatus === "partial" || coverageStatus === "unavailable"
        ? { status: coverageStatus, covered: num(task?.cov_covered) ?? 0, executable: num(task?.cov_executable) ?? 0 }
        : null,
      untestedFiles: list(task?.untested).length,
      gold: task?.gold === "passed" || task?.gold === "failed" || task?.gold === "skipped" ? task.gold : null,
      grade: grade ? { total: effectiveTotal({ agent_total: grade.agent_total as number, instructor_total: grade.instructor_total as number | null }), released: Boolean(grade.released_at) } : null,
      extraCodePrs: snapshot?.extraCodePrs ?? 0,
      hasReport: hasReport(task),
      reportDate: text(task?.report_date),
    };
  });
  // Newest submission first, then by assignment, email and slot, so the server's order is stable.
  const submittedAt = (row: TaskTableRow) => String(current.get(row.submissionId)?.submitted_at ?? "");
  return rows.sort((a, b) => submittedAt(b).localeCompare(submittedAt(a)) || a.assignment - b.assignment || a.email.localeCompare(b.email) || a.slot - b.slot);
}

/** One task position's staff-change paths: the chosen PR without its `before` diff details, and each extra PR without its diff. */
export function detailSnapshotPaths(position: number): string {
  const base = `snapshot->tasks->${position - 1}`;
  return [
    `choice_pr:${base}->workPrChoice->prNumber`,
    `choice_by:${base}->workPrChoice->>chosenBy`,
    `choice_at:${base}->workPrChoice->>chosenAt`,
    `choice_reason:${base}->workPrChoice->>reason`,
    `choice_before:${base}->workPrChoice->before->prNumber`,
    `task_file_pr:${base}->taskFilePr->number`,
    ...Array.from({ length: MAX_EXTRA_CODE_PRS }, (_, extra) => [
      `extra_${extra}_pr:${base}->extraCodePrs->${extra}->prNumber`,
      `extra_${extra}_by:${base}->extraCodePrs->${extra}->>addedBy`,
      `extra_${extra}_at:${base}->extraCodePrs->${extra}->>addedAt`,
      `extra_${extra}_reason:${base}->extraCodePrs->${extra}->>reason`,
    ].join(",")),
  ].join(",");
}

/** The columns of the one task the detail route reads: the spec and patches whole, the lists, the detail, the report's date. */
export const TASK_DETAIL_TASK_COLUMNS = [
  "problem_statement", "patch", "test_patch", "FAIL_TO_PASS", "PASS_TO_PASS",
  "validated_at:validation_detail->>validated_at",
  "repo_source:validation_detail->>repo_source",
  "untested:validation_detail->untested_files",
  "report_files:repo_metrics->filesAnalyzed",
  "report_source:repo_metrics->source->>type",
  "report_date:repo_metrics->>analysis_timestamp",
].join(",");

/**
 * One task of the course for the opened row, by its source id; null when the course has no such task. Throws on a
 * read error.
 */
export async function loadTaskDetail(db: TaskTableDb, courseId: string, sourceId: string): Promise<TaskDetail | null> {
  const sources = await pages((from, to) => db.from("cse_benchmark_task_sources").select("id,instance_id,assignment_submission_id,task_slot,validation_status,flags")
    .eq("course_id", courseId).eq("id", sourceId).order("id").range(from, to));
  const source = sources[0];
  if (!source) return null;
  const slot = Number(source.task_slot);
  const submissionId = String(source.assignment_submission_id);
  const slotPaths = TASK_SLOTS.map((position) => `slot_${position}:snapshot->tasks->${position - 1}->slot`).join(",");
  const [tasks, slotRows] = await Promise.all([
    pages((from, to) => db.from("cse_benchmark_tasks").select(TASK_DETAIL_TASK_COLUMNS).eq("instance_id", String(source.instance_id)).order("instance_id").range(from, to)),
    pages((from, to) => db.from("cse_assignment_submissions").select(`id,${slotPaths}`).eq("course_id", courseId).eq("id", submissionId).order("id").range(from, to)),
  ]);
  const task = tasks[0];
  if (!task) return null;
  const position = TASK_SLOTS.find((item) => num(slotRows[0]?.[`slot_${item}`]) === slot) ?? null;
  const changes = position === null ? null : (await pages((from, to) => db.from("cse_assignment_submissions").select(`id,${detailSnapshotPaths(position)}`)
    .eq("course_id", courseId).eq("id", submissionId).order("id").range(from, to)))[0] ?? null;

  const choicePr = num(changes?.choice_pr);
  const extras: ExtraPrDetail[] = [];
  for (let extra = 0; extra < MAX_EXTRA_CODE_PRS; extra++) {
    const prNumber = num(changes?.[`extra_${extra}_pr`]);
    if (prNumber === null) continue;
    extras.push({ prNumber, reason: text(changes?.[`extra_${extra}_reason`]) ?? "", addedBy: text(changes?.[`extra_${extra}_by`]) ?? "staff", addedAt: text(changes?.[`extra_${extra}_at`]) ?? "" });
  }
  const validated = source.validation_status === "validated";
  const repoSource = task.repo_source === "github" || task.repo_source === "snapshot" ? task.repo_source : null;
  return {
    id: String(source.id),
    submissionId,
    slot,
    validationStatus: status(source.validation_status),
    flags: list(source.flags).map(String),
    problemStatement: typeof task.problem_statement === "string" ? task.problem_statement : "",
    patch: typeof task.patch === "string" ? task.patch : "",
    testPatch: typeof task.test_patch === "string" ? task.test_patch : "",
    failToPass: list(task.FAIL_TO_PASS).map(String),
    passToPass: list(task.PASS_TO_PASS).length,
    validation: validated ? { validatedAt: text(task.validated_at), repoSource, untestedFiles: list(task.untested).map(String) } : null,
    workPrChoice: choicePr === null ? null : {
      prNumber: choicePr,
      // The PR the student submitted, kept as the task-file PR: as the review page's workPrHeaderLine names it.
      submittedPrNumber: num(changes?.task_file_pr) ?? num(changes?.choice_before) ?? 0,
      reason: text(changes?.choice_reason) ?? "",
      chosenBy: text(changes?.choice_by) ?? "staff",
      chosenAt: text(changes?.choice_at) ?? "",
    },
    extraCodePrs: extras,
    hasReport: hasReport(task),
    reportDate: text(task.report_date),
  };
}
