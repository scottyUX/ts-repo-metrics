import { LLM_CRITERIA, RUBRIC, type CriterionName } from "@/lib/cse115a/rubric";

// How the AI grader is doing, from what is already stored (#423). Pure: no server imports, so the staff route,
// the Grader page and the tests share it. Every table comes two ways (#432): per assignment, and for the whole
// course (one course is one quarter). The output holds counts, plus, for the tasks staff changed, the submission
// key and task slot so the staff page can link to the review page; never an email, repo, PR number or task ID.
//
// The AI score is what the grade job saved (`rubric`, `agent_total`). The final score is what staff saved
// (`instructor_rubric`, `instructor_total`), or the AI score when staff saved nothing. A box is one rubric row.
// Since #429 a staff save records the AI grade on the task at that moment; a task regraded after such a save is
// compared with the grade staff saw, from the AI grade history, and grouped under that grade's version.

/** One current-or-superseded final submission, for the Progress table. */
export type GraderSubmissionInput = {
  /** Opaque key joining grades to their submission (the loader uses the submission id). */
  key: string;
  assignmentNumber: number;
  submittedAt: string;
  superseded: boolean;
  /** How many tasks the submission holds (its snapshot's task slots). */
  taskCount: number;
};

/** An entry of the AI grade history (`cse_task_ai_grades`), in the same shape as a grade's AI fields. */
export type SeenAiGrade = { rubric: unknown; agentTotal: number | string; model: string; promptVersion: string; gradedAt: string };

/** One `cse_task_grades` row with its submission's assignment, submitted time and superseded flag. */
export type GraderGradeInput = {
  /** The submission's key; returned only on the lists of changed tasks (#432), as the link's address. */
  submissionKey: string;
  /** The task's slot in the submission (`task_slot`). */
  taskSlot: number;
  assignmentNumber: number;
  submittedAt: string;
  superseded: boolean;
  rubric: unknown;
  agentTotal: number | string;
  model: string;
  promptVersion: string;
  gradedAt: string;
  instructorRubric: unknown;
  instructorTotal: number | string | null;
  releasedAt: string | null;
  /** When staff last saved points (#429). Null or missing: no save, or one made before save times were kept. */
  instructorSavedAt?: string | null;
  /** The graded_at of the AI grade on the task at that save (#429). */
  instructorSawGradedAt?: string | null;
  /** The history entry whose graded_at is instructorSawGradedAt, when that is not the newest grade; else null or missing. */
  seen?: SeenAiGrade | null;
};

export type GraderStatsInput = { submissions: GraderSubmissionInput[]; grades: GraderGradeInput[] };

/**
 * A row's group. `assignment` null is the whole quarter; `model` and `promptVersion` null is every grader
 * version of that assignment (or of the quarter) together.
 */
export type GroupKey = { assignment: number | null; model: string | null; promptVersion: string | null };

/** One compared task staff changed (or, for a box, one the AI left blank), for the links (#432). */
export type ChangedTask = {
  /** The submission key passed in; the route passes the submission id. */
  submissionId: string;
  taskSlot: number;
  assignment: number;
  /** The AI's points (a box's, or the total); null when the AI left the box blank. */
  ai: number | null;
  /** The final points; null when neither the AI nor staff gave the box a score. */
  final: number | null;
};

export type TotalsRow = GroupKey & {
  /** Released tasks compared (regraded-after-release tasks left out). */
  released: number;
  same: number;
  higher: number;
  lower: number;
  /** Final total minus AI total, summed. */
  pointsAdded: number;
  /** same / released, or null with none released. */
  sameShare: number | null;
  /** Final equals the AI on all six boxes and the AI left none blank. */
  accepted: number;
  acceptedShare: number | null;
  /** The tasks counted in `higher` and in `lower`, with both totals. */
  higherTasks: ChangedTask[];
  lowerTasks: ChangedTask[];
};

export type BoxSource = "llm" | "evidence";

/** One box over one assignment's compared tasks, or the quarter's. No grader version (#432). */
export type BoxRow = {
  box: CriterionName;
  points: number;
  source: BoxSource;
  assignment: number | null;
  tasks: number;
  blank: number;
  same: number;
  higher: number;
  lower: number;
  needsReview: number;
  /** Final box minus AI box (a blank AI box counts as 0), summed. */
  pointsAdded: number;
  /** same / (tasks - blank), or null when the AI scored none. */
  agreedShare: number | null;
  /** The tasks counted in `higher`, `lower` and `blank`; the same ones are not listed. */
  higherTasks: ChangedTask[];
  lowerTasks: ChangedTask[];
  blankTasks: ChangedTask[];
};

export type AiGaveRow = { box: CriterionName; points: number; full: number; half: number; zero: number; blank: number; other: number };

export type ProgressCounts = { submitted: number; graded: number; savedNotReleased: number; released: number; regradedAfterRelease: number };
export type WaitCounts = { submissions: number; medianMs: number | null };

/** Every table for one assignment (`assignment` a number) or for the whole quarter (`assignment` null). */
export type ScopeStats = {
  assignment: number | null;
  /** Released tasks compared in this scope; the "fewer than 10" rule reads this. */
  comparedTasks: number;
  /** A row per grader version, then the scope's own row (model and prompt version null) last. */
  totals: TotalsRow[];
  /** The six boxes, in rubric order. */
  boxes: BoxRow[];
  aiGave: AiGaveRow[];
  progress: ProgressCounts;
  waiting: WaitCounts;
};

export type GraderStats = {
  /** Released tasks compared, all assignments together. */
  comparedTasks: number;
  /** Released tasks regraded after release with no recorded staff save to compare against, left out. */
  regradedAfterRelease: number;
  /** Compared tasks with staff points but no recorded save time (saves made before #429), compared with the newest AI grade. */
  noSaveTime: number;
  /** One per assignment with a submission or grade, in order. */
  byAssignment: ScopeStats[];
  /** Every assignment together. */
  quarter: ScopeStats;
};

/** The staff route's answer (#432): the course's title and term (its quarter), and the numbers. */
export type GraderStatsResponse = GraderStats & { course: { title: string; term: string } };

/** Fewer released tasks than this and the page names no most- or least-agreed box. */
export const MIN_TASKS_FOR_EXTREMES = 10;

type AiBox = { awarded: number | null; needsReview: boolean; source: BoxSource | null };

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
/** Points are stored as numeric(5,2) and come back as strings; compare in hundredths. */
const cents = (value: number) => Math.round(value * 100);
const round2 = (value: number) => cents(value) / 100;
const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);

function items(raw: unknown): Array<Record<string, unknown>> {
  return Array.isArray(raw) ? raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

/** The AI's box, or a blank one when an older rubric has no such row. */
function aiBox(rubric: unknown, name: CriterionName): AiBox {
  const item = items(rubric).find((row) => row.name === name);
  if (!item) return { awarded: null, needsReview: false, source: null };
  const source = item.source === "llm" || item.source === "evidence" ? item.source : null;
  return { awarded: num(item.awarded), needsReview: item.needsReview === true, source };
}

/** The final box: staff's when staff saved a rubric holding it, else the AI's. */
function finalBox(grade: GraderGradeInput, name: CriterionName, ai: AiBox): number | null {
  const staff = items(grade.instructorRubric).find((row) => row.name === name);
  const awarded = staff ? num(staff.awarded) : null;
  return awarded ?? ai.awarded;
}

/** Released, but the AI graded it again afterwards: staff never saw this AI score. */
export function regradedAfterRelease(grade: Pick<GraderGradeInput, "releasedAt" | "gradedAt">): boolean {
  if (!grade.releasedAt) return false;
  return Date.parse(grade.gradedAt) > Date.parse(grade.releasedAt);
}

/** A staff save whose time and the AI grade then on the task were recorded (#429). */
export function hasRecordedSave(grade: Pick<GraderGradeInput, "instructorSavedAt" | "instructorSawGradedAt">): boolean {
  return Boolean(grade.instructorSavedAt && grade.instructorSawGradedAt);
}

/**
 * A released task as it is compared, or null when it is left out (unreleased, or regraded after release with
 * nothing recorded to compare against). After a recorded save, the AI side is the grade staff saw: the newest
 * when its graded_at is the one recorded, else the history entry `seen` (rubric, total, model and prompt
 * version). Otherwise (no save, a save made before save times were kept, or the entry not found) the AI side
 * is the newest grade, and a task regraded after release is left out, as before #429.
 */
export function comparedGrade(grade: GraderGradeInput): GraderGradeInput | null {
  if (!grade.releasedAt) return null;
  if (hasRecordedSave(grade)) {
    const saw = Date.parse(grade.instructorSawGradedAt!);
    if (saw === Date.parse(grade.gradedAt)) return grade;
    const seen = grade.seen;
    if (seen && Date.parse(seen.gradedAt) === saw) {
      return { ...grade, rubric: seen.rubric, agentTotal: seen.agentTotal, model: seen.model, promptVersion: seen.promptVersion, gradedAt: seen.gradedAt };
    }
  }
  return regradedAfterRelease(grade) ? null : grade;
}

/** The median of a list; the mean of the middle two for an even count; null for none. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const changed = (grade: GraderGradeInput, ai: number | null, final: number | null): ChangedTask =>
  ({ submissionId: grade.submissionKey, taskSlot: grade.taskSlot, assignment: grade.assignmentNumber, ai, final });

/** Task order inside a list: assignment, then submission, then slot, so a reload shows the same order. */
const byTask = (a: ChangedTask, b: ChangedTask) => a.assignment - b.assignment || a.submissionId.localeCompare(b.submissionId) || a.taskSlot - b.taskSlot;

/** One Totals row over these compared tasks. */
function totalsRow(key: GroupKey, rows: GraderGradeInput[]): TotalsRow {
  let same = 0; let added = 0; let accepted = 0;
  const higherTasks: ChangedTask[] = [];
  const lowerTasks: ChangedTask[] = [];
  for (const grade of rows) {
    const ai = num(grade.agentTotal) ?? 0;
    const final = num(grade.instructorTotal) ?? ai;
    const diff = cents(final) - cents(ai);
    if (diff === 0) same += 1;
    else (diff > 0 ? higherTasks : lowerTasks).push(changed(grade, round2(ai), round2(final)));
    added += final - ai;
    const asItStood = RUBRIC.every((row) => {
      const box = aiBox(grade.rubric, row.name);
      const kept = finalBox(grade, row.name, box);
      return box.awarded !== null && kept !== null && cents(kept) === cents(box.awarded);
    });
    if (asItStood) accepted += 1;
  }
  return {
    ...key, released: rows.length, same, higher: higherTasks.length, lower: lowerTasks.length, pointsAdded: round2(added),
    sameShare: share(same, rows.length), accepted, acceptedShare: share(accepted, rows.length),
    higherTasks: higherTasks.sort(byTask), lowerTasks: lowerTasks.sort(byTask),
  };
}

/** One box over these compared tasks. */
function boxRow(row: (typeof RUBRIC)[number], source: BoxSource, assignment: number | null, tasks: GraderGradeInput[]): BoxRow {
  let same = 0; let needsReview = 0; let added = 0;
  const higherTasks: ChangedTask[] = [];
  const lowerTasks: ChangedTask[] = [];
  const blankTasks: ChangedTask[] = [];
  for (const grade of tasks) {
    const ai = aiBox(grade.rubric, row.name);
    const final = finalBox(grade, row.name, ai);
    if (ai.needsReview) needsReview += 1;
    added += (final ?? 0) - (ai.awarded ?? 0);
    if (ai.awarded === null) { blankTasks.push(changed(grade, null, final === null ? null : round2(final))); continue; }
    const diff = cents(final ?? 0) - cents(ai.awarded);
    if (diff === 0) same += 1;
    else (diff > 0 ? higherTasks : lowerTasks).push(changed(grade, round2(ai.awarded), round2(final ?? 0)));
  }
  const blank = blankTasks.length;
  return {
    box: row.name, points: row.points, source, assignment, tasks: tasks.length, blank, same, higher: higherTasks.length, lower: lowerTasks.length,
    needsReview, pointsAdded: round2(added), agreedShare: share(same, tasks.length - blank),
    higherTasks: higherTasks.sort(byTask), lowerTasks: lowerTasks.sort(byTask), blankTasks: blankTasks.sort(byTask),
  };
}

/** What the AI gave, per box, over these current graded tasks (released or not). */
function aiGaveRows(grades: GraderGradeInput[]): AiGaveRow[] {
  return RUBRIC.map((row) => {
    const counts = { full: 0, half: 0, zero: 0, blank: 0, other: 0 };
    for (const grade of grades) {
      const awarded = aiBox(grade.rubric, row.name).awarded;
      if (awarded === null) counts.blank += 1;
      else if (cents(awarded) === cents(row.points)) counts.full += 1;
      else if (cents(awarded) === cents(row.points / 2)) counts.half += 1;
      else if (cents(awarded) === 0) counts.zero += 1;
      else counts.other += 1;
    }
    return { box: row.name, points: row.points, ...counts };
  });
}

const versionId = (grade: GraderGradeInput) => JSON.stringify([grade.model, grade.promptVersion]);

/** Everything the Grader page shows, from one course's submissions and grade rows. */
export function graderStats(input: GraderStatsInput): GraderStats {
  const current = input.grades.filter((grade) => !grade.superseded);
  const compared = current.flatMap((grade) => comparedGrade(grade) ?? []);
  const regraded = current.filter((grade) => grade.releasedAt && comparedGrade(grade) === null);
  const noSaveTime = compared.filter((grade) => items(grade.instructorRubric).length > 0 && !grade.instructorSavedAt).length;
  const currentSubmissions = input.submissions.filter((submission) => !submission.superseded);

  // A box's source is read over the whole course, so it is the same in every scope.
  const sources = new Map(RUBRIC.map((row) => {
    const seen = new Set(current.map((grade) => aiBox(grade.rubric, row.name).source).filter((source): source is BoxSource => source !== null));
    const source: BoxSource = seen.size === 1 ? [...seen][0]! : (LLM_CRITERIA as readonly string[]).includes(row.name) ? "llm" : "evidence";
    return [row.name, source];
  }));

  // Waiting time: per current submission with a released task, submitted to first released.
  const firstRelease = new Map<string, { assignment: number; submittedAt: string; releasedAt: number }>();
  for (const grade of current) {
    if (!grade.releasedAt) continue;
    const at = Date.parse(grade.releasedAt);
    const seen = firstRelease.get(grade.submissionKey);
    if (!seen || at < seen.releasedAt) firstRelease.set(grade.submissionKey, { assignment: grade.assignmentNumber, submittedAt: grade.submittedAt, releasedAt: at });
  }

  const scope = (assignment: number | null): ScopeStats => {
    const mine = <T extends { assignmentNumber: number }>(rows: T[]) => (assignment === null ? rows : rows.filter((row) => row.assignmentNumber === assignment));
    const tasks = mine(compared);
    const grades = mine(current);

    // Totals: a row per grader version, ordered by model then prompt version, then the scope's row.
    const versions = new Map<string, GraderGradeInput[]>();
    for (const grade of tasks) versions.set(versionId(grade), [...(versions.get(versionId(grade)) ?? []), grade]);
    const versionRows = [...versions.values()]
      .sort((a, b) => a[0]!.model.localeCompare(b[0]!.model) || a[0]!.promptVersion.localeCompare(b[0]!.promptVersion))
      .map((rows) => totalsRow({ assignment, model: rows[0]!.model, promptVersion: rows[0]!.promptVersion }, rows));
    const totals = [...versionRows, totalsRow({ assignment, model: null, promptVersion: null }, tasks)];

    const waits = [...firstRelease.values()].filter((item) => assignment === null || item.assignment === assignment).map((item) => item.releasedAt - Date.parse(item.submittedAt));
    return {
      assignment,
      comparedTasks: tasks.length,
      totals,
      boxes: RUBRIC.map((row) => boxRow(row, sources.get(row.name)!, assignment, tasks)),
      aiGave: aiGaveRows(grades),
      progress: {
        submitted: mine(currentSubmissions).reduce((sum, s) => sum + s.taskCount, 0),
        graded: grades.length,
        savedNotReleased: grades.filter((grade) => !grade.releasedAt && items(grade.instructorRubric).length > 0).length,
        released: grades.filter((grade) => grade.releasedAt).length,
        regradedAfterRelease: grades.filter(regradedAfterRelease).length,
      },
      waiting: { submissions: waits.length, medianMs: median(waits) },
    };
  };

  const assignments = [...new Set([...currentSubmissions.map((s) => s.assignmentNumber), ...current.map((g) => g.assignmentNumber)])].sort((a, b) => a - b);
  return { comparedTasks: compared.length, regradedAfterRelease: regraded.length, noSaveTime, byAssignment: assignments.map(scope), quarter: scope(null) };
}

// ---- Wording shared by the page and the tests ----

export function formatShare(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** "3 days 4 hours", "5 hours 10 minutes", "40 minutes". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (days > 0) return hours > 0 ? `${unit(days, "day")} ${unit(hours, "hour")}` : unit(days, "day");
  if (hours > 0) return rest > 0 ? `${unit(hours, "hour")} ${unit(rest, "minute")}` : unit(hours, "hour");
  return unit(rest, "minute");
}

/** "Fall 2026 · Assignment 2" or "Fall 2026 · all assignments" (#432). */
export function scopeLabel(term: string, assignment: number | null): string {
  return assignment === null ? `${term} · all assignments` : `${term} · Assignment ${assignment}`;
}

/** A Totals row's label: the scope, then the grader version when the row is one version's. */
export function groupLabel(term: string, key: GroupKey): string {
  const scope = scopeLabel(term, key.assignment);
  return key.model === null ? scope : `${scope} · ${key.model} · ${key.promptVersion}`;
}

function boxLine(label: string, scope: string, row: BoxRow): string {
  return `${label} in ${scope}: ${row.box}, ${row.same} of ${row.tasks - row.blank} kept as the AI scored them (${formatShare(row.agreedShare)}).`;
}

/** The lines above the box table for one scope: the box agreed with most and least, or why none is named. */
export function boxExtremesLines(term: string, stats: Pick<ScopeStats, "assignment" | "comparedTasks" | "boxes">): string[] {
  const scope = scopeLabel(term, stats.assignment);
  if (stats.comparedTasks < MIN_TASKS_FOR_EXTREMES) {
    return [`Only ${stats.comparedTasks} released ${stats.comparedTasks === 1 ? "task is" : "tasks are"} compared in ${scope}, fewer than ${MIN_TASKS_FOR_EXTREMES}, so no box is named as agreed with most or least.`];
  }
  const scored = stats.boxes.filter((row) => row.agreedShare !== null);
  if (scored.length === 0) return [`The AI left every box blank on the released tasks of ${scope}, so no box can be named.`];
  // Highest share first; on a tie, the box with more scored tasks, then rubric order.
  const sorted = [...scored].sort((a, b) => (b.agreedShare! - a.agreedShare!) || ((b.tasks - b.blank) - (a.tasks - a.blank)));
  const most = sorted[0]!;
  const least = sorted[sorted.length - 1]!;
  if (most.agreedShare === least.agreedShare) {
    return [`In ${scope}, every box the AI scored was kept as the AI scored it equally often (${formatShare(most.agreedShare)}).`];
  }
  return [boxLine("Agreed with most", scope, most), boxLine("Agreed with least", scope, least)];
}

/** The line naming which boxes the model scores and which come from recorded evidence. */
export function boxSourcesLine(boxes: Pick<BoxRow, "box" | "source">[]): string {
  const list = (source: BoxSource) => {
    const names = boxes.filter((row) => row.source === source).map((row) => row.box);
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
  };
  return `The model scores ${list("llm")}. ${list("evidence")} come from recorded evidence (CI results and PR history), not the model.`;
}

/** One line of a changed-task list: "Assignment 3 · Task 2: AI 1, final 2" (#432). */
export function changedTaskLine(task: ChangedTask): string {
  const points = (value: number | null) => (value === null ? "blank" : String(Number(value.toFixed(2))));
  return `Assignment ${task.assignment} · Task ${task.taskSlot}: AI ${points(task.ai)}, final ${points(task.final)}`;
}

/** The staff review page a changed task links to. The review page has no per-task address, so this is the submission's page. */
export function reviewHref(task: Pick<ChangedTask, "submissionId">): string {
  return `/cse115a/instructor/submissions/${encodeURIComponent(task.submissionId)}`;
}
