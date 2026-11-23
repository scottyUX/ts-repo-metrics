import { LLM_CRITERIA, RUBRIC, type CriterionName } from "@/lib/cse115a/rubric";

// How the AI grader is doing, from what is already stored (#423). Pure: no server imports, so the staff route,
// the Grader page and the tests share it. Counts only: the output holds no id, email, repo, PR number or task ID.
//
// The AI score is what the grade job saved (`rubric`, `agent_total`). The final score is what staff saved
// (`instructor_rubric`, `instructor_total`), or the AI score when staff saved nothing. A box is one rubric row.

/** One current-or-superseded final submission, for the Progress table. */
export type GraderSubmissionInput = {
  /** Opaque key joining grades to their submission. Used only inside this function; never in the output. */
  key: string;
  assignmentNumber: number;
  submittedAt: string;
  superseded: boolean;
  /** How many tasks the submission holds (its snapshot's task slots). */
  taskCount: number;
};

/** One `cse_task_grades` row with its submission's assignment, submitted time and superseded flag. */
export type GraderGradeInput = {
  submissionKey: string;
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
};

export type GraderStatsInput = { submissions: GraderSubmissionInput[]; grades: GraderGradeInput[] };

/** A row's group: one assignment and grader version, or `null` in all three for every task together. */
export type GroupKey = { assignment: number | null; model: string | null; promptVersion: string | null };

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
};

export type BoxRow = GroupKey & {
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
};

export type BoxSource = "llm" | "evidence";

export type BoxTable = { box: CriterionName; points: number; source: BoxSource; rows: BoxRow[] };

export type AiGaveRow = { box: CriterionName; points: number; full: number; half: number; zero: number; blank: number; other: number };

export type ProgressRow = {
  assignment: number;
  submitted: number;
  graded: number;
  savedNotReleased: number;
  released: number;
  regradedAfterRelease: number;
};

export type WaitRow = { assignment: number; submissions: number; medianMs: number | null };

export type GraderStats = {
  /** Released tasks compared, all assignments together; the "fewer than 10" rule reads this. */
  comparedTasks: number;
  regradedAfterRelease: number;
  totals: TotalsRow[];
  boxes: BoxTable[];
  aiGave: AiGaveRow[];
  progress: ProgressRow[];
  waiting: WaitRow[];
};

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

/** The median of a list; the mean of the middle two for an even count; null for none. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const groupId = (key: GroupKey) => JSON.stringify([key.assignment, key.model, key.promptVersion]);
const ALL: GroupKey = { assignment: null, model: null, promptVersion: null };

/** Groups in display order: by assignment, model, prompt version; the all-together row last. */
function orderedGroups(keys: Iterable<GroupKey>): GroupKey[] {
  const unique = new Map<string, GroupKey>();
  for (const key of keys) unique.set(groupId(key), key);
  const list = [...unique.values()].sort((a, b) =>
    (a.assignment ?? 0) - (b.assignment ?? 0) || String(a.model).localeCompare(String(b.model)) || String(a.promptVersion).localeCompare(String(b.promptVersion)));
  return [...list, ALL];
}

/** Everything the Grader page shows, from one course's submissions and grade rows. */
export function graderStats(input: GraderStatsInput): GraderStats {
  const current = input.grades.filter((grade) => !grade.superseded);
  const compared = current.filter((grade) => grade.releasedAt && !regradedAfterRelease(grade));
  const regraded = current.filter(regradedAfterRelease);

  const keyOf = (grade: GraderGradeInput): GroupKey => ({ assignment: grade.assignmentNumber, model: grade.model, promptVersion: grade.promptVersion });
  const groups = orderedGroups(compared.map(keyOf));
  const inGroup = (key: GroupKey) => (grade: GraderGradeInput) => key.assignment === null || groupId(keyOf(grade)) === groupId(key);

  // Table 1: totals.
  const totals: TotalsRow[] = groups.map((key) => {
    let same = 0; let higher = 0; let lower = 0; let added = 0; let accepted = 0;
    const rows = compared.filter(inGroup(key));
    for (const grade of rows) {
      const ai = num(grade.agentTotal) ?? 0;
      const final = num(grade.instructorTotal) ?? ai;
      const diff = cents(final) - cents(ai);
      if (diff === 0) same += 1; else if (diff > 0) higher += 1; else lower += 1;
      added += final - ai;
      const asItStood = RUBRIC.every((row) => {
        const box = aiBox(grade.rubric, row.name);
        const kept = finalBox(grade, row.name, box);
        return box.awarded !== null && kept !== null && cents(kept) === cents(box.awarded);
      });
      if (asItStood) accepted += 1;
    }
    return {
      ...key, released: rows.length, same, higher, lower, pointsAdded: round2(added),
      sameShare: share(same, rows.length), accepted, acceptedShare: share(accepted, rows.length),
    };
  });

  // Table 2: by rubric box.
  const boxes: BoxTable[] = RUBRIC.map((row) => {
    const sources = new Set(current.map((grade) => aiBox(grade.rubric, row.name).source).filter((source): source is BoxSource => source !== null));
    const source: BoxSource = sources.size === 1 ? [...sources][0]! : (LLM_CRITERIA as readonly string[]).includes(row.name) ? "llm" : "evidence";
    const rows: BoxRow[] = groups.map((key) => {
      let blank = 0; let same = 0; let higher = 0; let lower = 0; let needsReview = 0; let added = 0;
      const tasks = compared.filter(inGroup(key));
      for (const grade of tasks) {
        const ai = aiBox(grade.rubric, row.name);
        const final = finalBox(grade, row.name, ai);
        if (ai.needsReview) needsReview += 1;
        added += (final ?? 0) - (ai.awarded ?? 0);
        if (ai.awarded === null) { blank += 1; continue; }
        const diff = cents(final ?? 0) - cents(ai.awarded);
        if (diff === 0) same += 1; else if (diff > 0) higher += 1; else lower += 1;
      }
      return { ...key, tasks: tasks.length, blank, same, higher, lower, needsReview, pointsAdded: round2(added), agreedShare: share(same, tasks.length - blank) };
    });
    return { box: row.name, points: row.points, source, rows };
  });

  // Table 3: what the AI gave, on every current graded task, released or not.
  const aiGave: AiGaveRow[] = RUBRIC.map((row) => {
    const counts = { full: 0, half: 0, zero: 0, blank: 0, other: 0 };
    for (const grade of current) {
      const awarded = aiBox(grade.rubric, row.name).awarded;
      if (awarded === null) counts.blank += 1;
      else if (cents(awarded) === cents(row.points)) counts.full += 1;
      else if (cents(awarded) === cents(row.points / 2)) counts.half += 1;
      else if (cents(awarded) === 0) counts.zero += 1;
      else counts.other += 1;
    }
    return { box: row.name, points: row.points, ...counts };
  });

  // Progress and waiting time, per assignment.
  const currentSubmissions = input.submissions.filter((submission) => !submission.superseded);
  const assignments = [...new Set([...currentSubmissions.map((s) => s.assignmentNumber), ...current.map((g) => g.assignmentNumber)])].sort((a, b) => a - b);
  const progress: ProgressRow[] = assignments.map((assignment) => {
    const grades = current.filter((grade) => grade.assignmentNumber === assignment);
    return {
      assignment,
      submitted: currentSubmissions.filter((s) => s.assignmentNumber === assignment).reduce((sum, s) => sum + s.taskCount, 0),
      graded: grades.length,
      savedNotReleased: grades.filter((grade) => !grade.releasedAt && items(grade.instructorRubric).length > 0).length,
      released: grades.filter((grade) => grade.releasedAt).length,
      regradedAfterRelease: grades.filter(regradedAfterRelease).length,
    };
  });

  // Waiting time: per current submission with a released task, submitted to first released.
  const firstRelease = new Map<string, { assignment: number; submittedAt: string; releasedAt: number }>();
  for (const grade of current) {
    if (!grade.releasedAt) continue;
    const at = Date.parse(grade.releasedAt);
    const seen = firstRelease.get(grade.submissionKey);
    if (!seen || at < seen.releasedAt) firstRelease.set(grade.submissionKey, { assignment: grade.assignmentNumber, submittedAt: grade.submittedAt, releasedAt: at });
  }
  const waiting: WaitRow[] = assignments.map((assignment) => {
    const waits = [...firstRelease.values()].filter((item) => item.assignment === assignment).map((item) => item.releasedAt - Date.parse(item.submittedAt));
    return { assignment, submissions: waits.length, medianMs: median(waits) };
  });

  return { comparedTasks: compared.length, regradedAfterRelease: regraded.length, totals, boxes, aiGave, progress, waiting };
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

/** The All row of one box. */
const allRow = (table: BoxTable) => table.rows[table.rows.length - 1]!;

function boxLine(label: string, table: BoxTable): string {
  const row = allRow(table);
  return `${label}: ${table.box}, ${row.same} of ${row.tasks - row.blank} kept as the AI scored them (${formatShare(row.agreedShare)}).`;
}

/** The two lines above Table 2: the box agreed with most and least, or why none is named. */
export function boxExtremesLines(stats: Pick<GraderStats, "comparedTasks" | "boxes">): string[] {
  if (stats.comparedTasks < MIN_TASKS_FOR_EXTREMES) {
    return [`Only ${stats.comparedTasks} released ${stats.comparedTasks === 1 ? "task is" : "tasks are"} compared, fewer than ${MIN_TASKS_FOR_EXTREMES}, so no box is named as agreed with most or least.`];
  }
  const scored = stats.boxes.filter((table) => allRow(table).agreedShare !== null);
  if (scored.length === 0) return ["The AI left every box blank on the released tasks, so no box can be named."];
  // Highest share first; on a tie, the box with more scored tasks, then rubric order.
  const order = (a: BoxTable, b: BoxTable) => (allRow(b).agreedShare! - allRow(a).agreedShare!)
    || ((allRow(b).tasks - allRow(b).blank) - (allRow(a).tasks - allRow(a).blank));
  const sorted = [...scored].sort(order);
  const most = sorted[0]!;
  const least = sorted[sorted.length - 1]!;
  if (allRow(most).agreedShare === allRow(least).agreedShare) {
    return [`Every box the AI scored was kept as the AI scored it equally often (${formatShare(allRow(most).agreedShare)}).`];
  }
  return [boxLine("Agreed with most", most), boxLine("Agreed with least", least)];
}

/** The line naming which boxes the model scores and which come from recorded evidence. */
export function boxSourcesLine(boxes: Pick<BoxTable, "box" | "source">[]): string {
  const list = (source: BoxSource) => {
    const names = boxes.filter((table) => table.source === source).map((table) => table.box);
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
  };
  return `The model scores ${list("llm")}. ${list("evidence")} come from recorded evidence (CI results and PR history), not the model.`;
}

/** A group's label: "Assignment 2 · gpt-4o · cse115a-grader-v3", or "All". */
export function groupLabel(key: GroupKey): string {
  return key.assignment === null ? "All" : `Assignment ${key.assignment} · ${key.model} · ${key.promptVersion}`;
}
