import "server-only";
import { buildOverviewScoreStrip } from "@/lib/buildOverviewCards";
import { CONSENT_VERSION, countsAsConsent } from "@/lib/cse115a/consent";
import { effectiveTotal } from "@/lib/cse115a/gradeReview";
import { teamLink } from "@/lib/cse115a/reviewText";
import { RUBRIC } from "@/lib/cse115a/rubric";
import { isTaskSlot, TASK_SLOTS } from "@/lib/cse115a/taskSlots";
import { MAX_EXTRA_CODE_PRS } from "@/lib/cse115a/submissionSnapshot";
import type { RepoReport } from "@/lib/reportTypes";
import { gradeBoxes, type ConsentValue, type CoverageDetail, type CoverageFileDetail, type ExtraPrDetail, type ReportScore, type TaskDetail, type TaskGrade, type TaskTableRow } from "./taskTable";

// The two staff routes behind the Benchmark page's task table (#444, #445, #449). Both read; neither writes. The list
// reads small columns and JSON paths only: never `problem_statement`, `patch` or `test_patch`, and never a diff. Since
// #449 it reads `cse_research_consent` (user, yes or no, wording version) to send each row's yes or no by the
// downloads' rule, `countsAsConsent`; since #452 one of three values (Yes, No to the current wording, Not yet), and
// still never the wording version or a date. The detail route reads one task's spec,
// patches and stored report when a row is opened, and sends the report's scores, never the report, and since #452 the
// stored coverage run's per-file states and totals.

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

/** The tables the list reads. `cse_research_consent` is read for the Consented column only (#449). */
export const TASK_TABLE_TABLES = ["cse_benchmark_task_sources", "cse_assignment_submissions", "cse_benchmark_tasks", "cse_task_grades", "cse_course_memberships", "cse_course_roles", "cse_research_consent"] as const;

/** The consent columns the list reads: who, yes or no, and the wording version, which countsAsConsent needs. */
export const TASK_TABLE_CONSENT_COLUMNS = "user_id,consented,consent_version";

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

/**
 * The grade columns both routes read: the totals and release, and each stored rubric entry's name and points as JSON
 * paths (never the rationales or quotes).
 */
export const TASK_GRADE_COLUMNS = [
  "assignment_submission_id", "task_slot", "agent_total", "instructor_total", "released_at",
  ...RUBRIC.flatMap((_, index) => [
    `ai_name_${index}:rubric->${index}->>name`, `ai_pts_${index}:rubric->${index}->awarded`,
    `ed_name_${index}:instructor_rubric->${index}->>name`, `ed_pts_${index}:instructor_rubric->${index}->awarded`,
  ]),
].join(",");

/** A grade row as the table shows it: effectiveTotal, released, and each box's final points. */
export function taskGradeFrom(row: Record<string, unknown>): TaskGrade {
  const entries = (prefix: "ai" | "ed") => RUBRIC.map((_, index) => ({ name: text(row[`${prefix}_name_${index}`]), awarded: num(row[`${prefix}_pts_${index}`]) }))
    .filter((entry): entry is { name: string; awarded: number | null } => entry.name !== null);
  const edited = entries("ed");
  return {
    total: effectiveTotal({ agent_total: row.agent_total as number, instructor_total: row.instructor_total as number | null }),
    released: Boolean(row.released_at),
    // The instructor's rubric holds every box when it exists (parseInstructorRubric), so an empty one means not edited.
    boxes: gradeBoxes(edited.length ? edited : null, entries("ai")),
  };
}

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

/**
 * A stored answer as the Consent column shows it. Yes: the downloads' rule (a yes to the current, approved wording).
 * No: a no to the current wording. Not yet: anything else, an answer to an older wording included.
 */
export function consentValue(row: { consented?: unknown; consent_version?: unknown } | null | undefined): ConsentValue {
  if (!row) return "not_yet";
  const answer = { consented: row.consented === true, consent_version: String(row.consent_version ?? "") };
  if (countsAsConsent(answer)) return "yes";
  return row.consented === false && answer.consent_version === CONSENT_VERSION ? "no" : "not_yet";
}

const FILE_STATES: ReadonlyArray<CoverageFileDetail["state"]> = ["run", "not_run", "not_measured", "no_code"];

/**
 * The stored coverage run (`validation_detail.fix_coverage`, fixCoverage.ts) as the opened row shows it: each file's
 * path, state and lines, and the run's own totals, copied, never recomputed. Null when there is none or it is unreadable.
 */
export function coverageDetail(value: unknown): CoverageDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const run = value as Record<string, unknown>;
  if (run.status !== "measured" && run.status !== "partial" && run.status !== "unavailable") return null;
  const files = list(run.files).flatMap((item): CoverageFileDetail[] => {
    if (!item || typeof item !== "object") return [];
    const file = item as Record<string, unknown>;
    const path = text(file.path);
    const state = FILE_STATES.find((value) => value === file.state);
    return path && state ? [{ path, state, covered: num(file.covered), executable: num(file.executable) }] : [];
  });
  return {
    status: run.status, reason: text(run.reason), files,
    filesChanged: num(run.files_changed) ?? 0, filesRun: num(run.files_run) ?? 0,
    linesCovered: num(run.lines_covered) ?? 0, linesExecutable: num(run.lines_executable) ?? 0,
  };
}

function status(value: unknown): TaskTableRow["validationStatus"] {
  return value === "validated" || value === "rejected" ? value : "candidate";
}

/**
 * One row per current task of the course: every benchmark source whose submission is the active attempt
 * (`superseded_at is null`), every assignment, newest submission first. Throws on a read error.
 */
export async function loadTaskTable(db: TaskTableDb, courseId: string): Promise<TaskTableRow[]> {
  const [submissions, sources, members, roles, consent] = await Promise.all([
    pages((from, to) => db.from("cse_assignment_submissions").select(`id,user_id,assignment_number,submitted_at,${TASK_TABLE_SNAPSHOT_PATHS}`)
      .eq("course_id", courseId).is("superseded_at", null).order("id").range(from, to)),
    pages((from, to) => db.from("cse_benchmark_task_sources").select("id,instance_id,user_id,assignment_submission_id,task_slot,validation_status,flags")
      .eq("course_id", courseId).order("id").range(from, to)),
    pages((from, to) => db.from("cse_course_memberships").select("user_id,ucsc_email").eq("course_id", courseId).order("user_id").range(from, to)),
    pages((from, to) => db.from("cse_course_roles").select("email").eq("course_id", courseId).order("email").range(from, to)),
    pages((from, to) => db.from("cse_research_consent").select(TASK_TABLE_CONSENT_COLUMNS).eq("course_id", courseId).order("user_id").range(from, to)),
  ]);
  const current = new Map(submissions.map((row) => [String(row.id), row]));
  const listed = sources.filter((row) => current.has(String(row.assignment_submission_id)));
  const instanceIds = [...new Set(listed.map((row) => String(row.instance_id)))];
  const submissionIds = [...new Set(listed.map((row) => String(row.assignment_submission_id)))];
  const [tasks, grades] = await Promise.all([
    chunked(instanceIds, (chunk) => db.from("cse_benchmark_tasks").select(TASK_TABLE_TASK_COLUMNS).in("instance_id", chunk)),
    chunked(submissionIds, (chunk) => db.from("cse_task_grades").select(TASK_GRADE_COLUMNS).in("assignment_submission_id", chunk)),
  ]);
  const taskBy = new Map(tasks.map((row) => [String(row.instance_id), row]));
  const gradeBy = new Map(grades.map((row) => [`${row.assignment_submission_id}:${row.task_slot}`, row]));
  const emailBy = new Map(members.map((row) => [String(row.user_id), String(row.ucsc_email ?? "")]));
  const staffEmails = new Set(roles.map((row) => String(row.email ?? "").toLowerCase()));
  const consentBy = new Map(consent.map((row) => [String(row.user_id), consentValue(row)]));
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
      consent: consentBy.get(String(source.user_id)) ?? "not_yet",
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
      grade: grade ? taskGradeFrom(grade) : null,
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

/**
 * The columns of the one task the detail route reads: the spec and patches whole, the lists, the detail, the report's
 * date, and the stored report itself, which is scored on the server and never sent.
 */
export const TASK_DETAIL_TASK_COLUMNS = [
  "problem_statement", "patch", "test_patch", "FAIL_TO_PASS", "PASS_TO_PASS", "repo_metrics",
  "validated_at:validation_detail->>validated_at",
  "repo_source:validation_detail->>repo_source",
  "untested:validation_detail->untested_files",
  "fix_coverage:validation_detail->fix_coverage",
  "report_files:repo_metrics->filesAnalyzed",
  "report_source:repo_metrics->source->>type",
  "report_date:repo_metrics->>analysis_timestamp",
].join(",");

/** The four scores the opened row shows, in this order, as the metrics page's score strip names them. */
export const REPORT_SCORE_IDS = ["commit-habits", "testing", "code-quality", "code-complexity"] as const;

/**
 * Commit Habits, Testing, Code Quality and Code Complexity from a stored report, by the metrics page's own rule
 * (buildOverviewScoreStrip; the React tile is left out). A report the analysis skipped has no Testing or Code Quality,
 * as on the metrics page. Null when there is no report or it cannot be scored.
 */
export function reportScores(report: unknown): ReportScore[] | null {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  try {
    const { items } = buildOverviewScoreStrip(report as RepoReport, false);
    return REPORT_SCORE_IDS.flatMap((id) => {
      const item = items.find((entry) => entry.id === id);
      return item ? [{ id, title: item.title, score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null }] : [];
    });
  } catch {
    return null;
  }
}

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
  const [tasks, slotRows, grades] = await Promise.all([
    pages((from, to) => db.from("cse_benchmark_tasks").select(TASK_DETAIL_TASK_COLUMNS).eq("instance_id", String(source.instance_id)).order("instance_id").range(from, to)),
    pages((from, to) => db.from("cse_assignment_submissions").select(`id,${slotPaths}`).eq("course_id", courseId).eq("id", submissionId).order("id").range(from, to)),
    pages((from, to) => db.from("cse_task_grades").select(TASK_GRADE_COLUMNS).eq("assignment_submission_id", submissionId).eq("task_slot", slot).order("task_slot").range(from, to)),
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
    coverage: coverageDetail(task.fix_coverage),
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
    grade: grades[0] ? taskGradeFrom(grades[0]) : null,
    scores: hasReport(task) ? reportScores(task.repo_metrics) : null,
  };
}
