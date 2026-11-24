// The Grader tab (#423): the pure numbers, the staff route, the page's wording, and that nothing student-facing
// imports any of it. Routes run against an in-memory fake; nothing reaches GitHub or Supabase. Every row, email,
// id, model and version here is made up.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RUBRIC, type CriterionName } from "@/lib/cse115a/rubric";
import {
  aiGaveTaskLine, boxExtremesLines, boxSourcesLine, changedTaskLine, formatDuration, graderStats, groupLabel, median, MIN_TASKS_FOR_EXTREMES, reviewHref, scopeLabel,
  type GraderGradeInput, type GraderStats, type GraderStatsResponse, type GraderSubmissionInput,
} from "@/lib/cse115a/graderStats";
import {
  aiGaveListHeading, changedListHeading, GRADER_TEXT, GraderView, noSaveTimeLine, quarterLine, regradedLine, signedPoints,
} from "@/components/cse115a/instructor/GraderPanel";

vi.mock("server-only", () => ({}));

// ---- Made-up rows ----

type Boxes = Partial<Record<CriterionName, number | null | "missing">>;
const LLM = new Set(["Scope", "Specs", "Acceptance criteria", "Test quality"]);

/** An AI rubric: every box full unless overridden; `null` is blank, "missing" leaves the box out (an older row). */
function aiRubric(boxes: Boxes = {}, needsReview: CriterionName[] = []) {
  return RUBRIC.flatMap((row) => {
    const value = row.name in boxes ? boxes[row.name]! : row.points;
    if (value === "missing") return [];
    return [{ name: row.name, points: row.points, level: value === null ? null : "full", awarded: value, rationale: "made up", evidenceQuotes: [], needsReview: needsReview.includes(row.name), source: LLM.has(row.name) ? "llm" : "evidence" }];
  });
}
function staffRubric(values: Record<CriterionName, number>) {
  return RUBRIC.map((row) => ({ name: row.name, points: row.points, awarded: values[row.name], note: "" }));
}
const sumOf = (rubric: Array<{ awarded: number | null }>) => rubric.reduce((sum, row) => sum + (row.awarded ?? 0), 0);

let counter = 0;
type GradeOptions = {
  assignment?: number; model?: string; prompt?: string; ai?: Boxes; needsReview?: CriterionName[];
  staff?: Partial<Record<CriterionName, number>> | "same" | null; released?: boolean; regradedAfter?: boolean;
  superseded?: boolean; submittedAt?: string; releasedAt?: string; key?: string; slot?: number;
};
function grade(options: GradeOptions = {}): GraderGradeInput {
  counter += 1;
  const rubric = aiRubric(options.ai, options.needsReview);
  const aiValues = Object.fromEntries(RUBRIC.map((row) => [row.name, rubric.find((item) => item.name === row.name)?.awarded ?? 0])) as Record<CriterionName, number>;
  const staff = options.staff === undefined || options.staff === null ? null
    : staffRubric(options.staff === "same" ? aiValues : { ...aiValues, ...options.staff });
  const releasedAt = options.released === false ? null : options.releasedAt ?? "2026-10-10T12:00:00Z";
  return {
    submissionKey: options.key ?? `sub-${counter}`,
    taskSlot: options.slot ?? 1,
    assignmentNumber: options.assignment ?? 2,
    submittedAt: options.submittedAt ?? "2026-10-08T12:00:00Z",
    superseded: options.superseded ?? false,
    rubric,
    agentTotal: String(sumOf(rubric).toFixed(2)), // numeric(5,2) comes back as a string
    model: options.model ?? "model-a",
    promptVersion: options.prompt ?? "prompt-v1",
    gradedAt: options.regradedAfter ? "2026-10-11T12:00:00Z" : "2026-10-09T12:00:00Z",
    instructorRubric: staff,
    instructorTotal: staff ? String(sumOf(staff)) : null,
    releasedAt,
  };
}
const statsOf = (grades: GraderGradeInput[], submissions: GraderSubmissionInput[] = []) => graderStats({ grades, submissions });
/** The quarter's own Totals row (every grader version together). */
const allTotals = (stats: GraderStats) => stats.quarter.totals[stats.quarter.totals.length - 1]!;
/** One box over the whole quarter. */
const box = (stats: GraderStats, name: CriterionName) => stats.quarter.boxes.find((row) => row.box === name)!;
/** Progress and Time per assignment, in the shape the tables had before #432. */
const progressOf = (stats: GraderStats) => stats.byAssignment.map((item) => ({ assignment: item.assignment, ...item.progress }));
const waitingOf = (stats: GraderStats) => stats.byAssignment.map((item) => ({ assignment: item.assignment, ...item.waiting }));

// ---- 1. The function ----

describe("graderStats: totals", () => {
  it("counts same, higher and lower totals and the points added", () => {
    const stats = statsOf([
      grade(),
      grade({ staff: { Scope: 0.5 } }),
      grade({ ai: { Specs: 1 }, staff: { Specs: 2 } }),
      grade({ ai: { Specs: 1 }, staff: { Specs: 2, "Test quality": 1 } }),
    ]);
    expect(allTotals(stats)).toMatchObject({ released: 4, same: 2, higher: 1, lower: 1, pointsAdded: 0.5, sameShare: 0.5 });
  });

  it("a box changed with the total unchanged (one up, one down): total same, the boxes higher and lower, not accepted", () => {
    const stats = statsOf([grade({ ai: { Specs: 1 }, staff: { Specs: 2, "Acceptance criteria": 1 } })]);
    expect(allTotals(stats)).toMatchObject({ same: 1, higher: 0, lower: 0, pointsAdded: 0, accepted: 0 });
    expect(box(stats, "Specs")).toMatchObject({ same: 0, higher: 1, lower: 0, pointsAdded: 1 });
    expect(box(stats, "Acceptance criteria")).toMatchObject({ same: 0, higher: 0, lower: 1, pointsAdded: -1 });
  });

  it("staff saved with no number changed counts as accepted as it stood", () => {
    expect(allTotals(statsOf([grade({ staff: "same" })]))).toMatchObject({ same: 1, accepted: 1, acceptedShare: 1 });
  });

  it("never saved also counts as accepted when no box is blank", () => {
    expect(allTotals(statsOf([grade({ staff: null })]))).toMatchObject({ same: 1, accepted: 1 });
  });

  it("a blank box filled by staff is not accepted as it stood", () => {
    const stats = statsOf([grade({ ai: { "Test quality": null }, staff: { "Test quality": 2 } })]);
    expect(allTotals(stats)).toMatchObject({ higher: 1, accepted: 0, pointsAdded: 2 });
    expect(box(stats, "Test quality")).toMatchObject({ tasks: 1, blank: 1, same: 0, higher: 0, lower: 0, pointsAdded: 2, agreedShare: null });
  });

  it("does not use 'instructor_rubric is null' for accepted: a blank box with no staff save is not accepted", () => {
    // Only reachable with an old row; the release rule normally stops it.
    expect(allTotals(statsOf([grade({ ai: { Process: null } })])).accepted).toBe(0);
  });
});

describe("graderStats: boxes", () => {
  it("a box the AI left blank counts as blank, in neither same, higher nor lower", () => {
    const stats = statsOf([grade({ ai: { Scope: null }, staff: { Scope: 0 } }), grade()]);
    expect(box(stats, "Scope")).toMatchObject({ tasks: 2, blank: 1, same: 1, higher: 0, lower: 0, agreedShare: 1 });
  });

  it("a box missing from an old rubric counts as blank, and its staff points are added from 0", () => {
    const stats = statsOf([grade({ ai: { Process: "missing" }, staff: { Process: 1 } })]);
    expect(box(stats, "Process")).toMatchObject({ tasks: 1, blank: 1, same: 0, higher: 0, lower: 0, pointsAdded: 1 });
    expect(allTotals(stats).accepted).toBe(0);
  });

  it("counts the AI's Needs review flags per box", () => {
    expect(box(statsOf([grade({ needsReview: ["Specs"] }), grade({ needsReview: ["Specs", "Scope"] })]), "Specs").needsReview).toBe(2);
  });

  it("always has all six boxes, with their source from the stored rubric", () => {
    const stats = statsOf([grade()]);
    expect(stats.quarter.boxes.map((row) => row.box)).toEqual(RUBRIC.map((row) => row.name));
    expect(stats.quarter.boxes.map((row) => row.source)).toEqual(["llm", "llm", "llm", "llm", "evidence", "evidence"]);
    expect(boxSourcesLine(stats.quarter.boxes)).toBe("The model scores Scope, Specs, Acceptance criteria and Test quality. Tests pass and Process come from recorded evidence (CI results and PR history), not the model.");
  });
});

describe("graderStats: what is left out", () => {
  it("a superseded attempt is left out of everything", () => {
    const stats = statsOf([grade({ superseded: true, staff: { Scope: 0 } }), grade()],
      [{ key: "old", assignmentNumber: 2, submittedAt: "2026-10-01T00:00:00Z", superseded: true, taskCount: 2 }]);
    expect(stats.comparedTasks).toBe(1);
    expect(allTotals(stats)).toMatchObject({ released: 1, same: 1, lower: 0 });
    expect(stats.quarter.aiGave[0]!.full).toBe(1);
    expect(progressOf(stats)).toEqual([{ assignment: 2, submitted: 0, graded: 1, savedNotReleased: 0, released: 1, regradedAfterRelease: 0 }]);
  });

  it("an unreleased task is left out of agreement but counted in Table 3 and Progress", () => {
    const stats = statsOf([grade({ released: false, ai: { Specs: 1 }, staff: { Specs: 2 } }), grade()],
      [{ key: "x", assignmentNumber: 2, submittedAt: "2026-10-08T12:00:00Z", superseded: false, taskCount: 2 }]);
    expect(allTotals(stats).released).toBe(1);
    expect(box(stats, "Specs").tasks).toBe(1);
    expect(stats.quarter.aiGave.find((row) => row.box === "Specs")).toMatchObject({ full: 1, half: 1, zero: 0, blank: 0 });
    expect(progressOf(stats)[0]).toEqual({ assignment: 2, submitted: 2, graded: 2, savedNotReleased: 1, released: 1, regradedAfterRelease: 0 });
  });

  it("a task regraded after release is left out of agreement and counted on its own line", () => {
    const stats = statsOf([grade({ regradedAfter: true, staff: { Scope: 0 } }), grade()]);
    expect(stats.regradedAfterRelease).toBe(1);
    expect(stats.comparedTasks).toBe(1);
    expect(allTotals(stats)).toMatchObject({ released: 1, lower: 0 });
    expect(progressOf(stats)[0]).toMatchObject({ released: 2, regradedAfterRelease: 1 });
    expect(stats.quarter.aiGave[0]!.full).toBe(2);
    expect(regradedLine(1)).toBe("1 released task was regraded after release. Staff never saw that AI score, so it is left out of every agreement number.");
  });
});

describe("graderStats: groups", () => {
  // #432: Totals keeps a row per grader version inside each assignment and inside the quarter; the box table has none.
  it("two grader versions in one sprint get a Totals row each, and the assignment and quarter rows add them", () => {
    const stats = statsOf([
      grade({ prompt: "prompt-v1" }), grade({ prompt: "prompt-v1", staff: { Scope: 0 } }),
      grade({ prompt: "prompt-v2", model: "model-b" }),
      grade({ assignment: 3, prompt: "prompt-v2", model: "model-b", ai: { Specs: 1 }, staff: { Specs: 2 } }),
    ]);
    const pick = (row: GraderStats["quarter"]["totals"][number]) => [row.assignment, row.model, row.promptVersion, row.released, row.same, row.higher, row.lower];
    expect(stats.byAssignment.map((item) => item.totals.map(pick))).toEqual([
      [[2, "model-a", "prompt-v1", 2, 1, 0, 1], [2, "model-b", "prompt-v2", 1, 1, 0, 0], [2, null, null, 3, 2, 0, 1]],
      [[3, "model-b", "prompt-v2", 1, 0, 1, 0], [3, null, null, 1, 0, 1, 0]],
    ]);
    expect(stats.quarter.totals.map(pick)).toEqual([
      [null, "model-a", "prompt-v1", 2, 1, 0, 1],
      [null, "model-b", "prompt-v2", 2, 1, 1, 0],
      [null, null, null, 4, 2, 1, 1],
    ]);
    // The box table: one row per box per assignment, and one per box for the quarter; no grader version.
    expect(stats.byAssignment.map((item) => item.boxes.length)).toEqual([6, 6]);
    expect(stats.byAssignment[0]!.boxes[0]).not.toHaveProperty("model");
    expect(stats.quarter.boxes.map((row) => row.tasks)).toEqual([4, 4, 4, 4, 4, 4]);
  });
});

describe("the most- and least-agreed box lines", () => {
  it("names no winner below 10 released tasks", () => {
    const stats = statsOf(Array.from({ length: MIN_TASKS_FOR_EXTREMES - 1 }, () => grade()));
    expect(boxExtremesLines("Fall 2026", stats.quarter)).toEqual(["Only 9 released tasks are compared in Fall 2026 · all assignments, fewer than 10, so no box is named as agreed with most or least."]);
    expect(boxExtremesLines("Fall 2026", stats.byAssignment[0]!)).toEqual(["Only 9 released tasks are compared in Fall 2026 · Assignment 2, fewer than 10, so no box is named as agreed with most or least."]);
  });

  it("counts each assignment on its own: 10 in the quarter, under 10 in each assignment, names a box only for the quarter", () => {
    const grades = [...Array.from({ length: 5 }, () => grade({ assignment: 2 })), ...Array.from({ length: 5 }, () => grade({ assignment: 3, staff: { Specs: 1 } }))];
    const stats = statsOf(grades);
    expect(boxExtremesLines("Fall 2026", stats.quarter)[0]).toBe("Agreed with most in Fall 2026 · all assignments: Scope, 10 of 10 kept as the AI scored them (100%).");
    expect(stats.byAssignment.map((item) => boxExtremesLines("Fall 2026", item))).toEqual([
      ["Only 5 released tasks are compared in Fall 2026 · Assignment 2, fewer than 10, so no box is named as agreed with most or least."],
      ["Only 5 released tasks are compared in Fall 2026 · Assignment 3, fewer than 10, so no box is named as agreed with most or least."],
    ]);
  });

  it("names the box agreed with most and least, with their numbers, from 10 tasks", () => {
    const grades = Array.from({ length: 10 }, (_, index) => grade({
      staff: { ...(index < 4 ? { "Test quality": 1 } : {}), ...(index === 0 ? { Specs: 1 } : {}) },
    }));
    expect(boxExtremesLines("Fall 2026", statsOf(grades).quarter)).toEqual([
      "Agreed with most in Fall 2026 · all assignments: Scope, 10 of 10 kept as the AI scored them (100%).",
      "Agreed with least in Fall 2026 · all assignments: Test quality, 6 of 10 kept as the AI scored them (60%).",
    ]);
  });

  it("says so when every box is agreed equally", () => {
    expect(boxExtremesLines("Fall 2026", statsOf(Array.from({ length: 10 }, () => grade())).quarter)).toEqual(["In Fall 2026 · all assignments, every box the AI scored was kept as the AI scored it equally often (100%)."]);
  });
});

describe("waiting time", () => {
  it("median: the middle value for an odd count, the mean of the middle two for an even count", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("is per submission, submitted to first released, per assignment", () => {
    const hours = (n: number) => new Date(Date.parse("2026-10-08T00:00:00Z") + n * 3_600_000).toISOString();
    const submittedAt = hours(0);
    const stats = statsOf([
      grade({ key: "a", submittedAt, releasedAt: hours(10) }), grade({ key: "a", submittedAt, releasedAt: hours(30) }),
      grade({ key: "b", submittedAt, releasedAt: hours(20) }),
      grade({ key: "c", submittedAt, releasedAt: hours(50) }),
      grade({ key: "d", submittedAt, released: false }),
    ]);
    expect(waitingOf(stats)).toEqual([{ assignment: 2, submissions: 3, medianMs: 20 * 3_600_000 }]);
    expect(formatDuration(20 * 3_600_000)).toBe("20 hours");
    expect(formatDuration(52 * 3_600_000)).toBe("2 days 4 hours");
    expect(formatDuration(90 * 60_000)).toBe("1 hour 30 minutes");
    expect(formatDuration(null)).toBe("—");
  });
});

// ---- 1b. Proof against the agreement queries ----
//
// The queries as SQL, run by hand against the same rows:
//
//   -- Query 1: totals per assignment and grader version
//   select s.assignment_number, g.model, g.prompt_version, count(*) as tasks,
//     count(*) filter (where coalesce(g.instructor_total, g.agent_total) = g.agent_total) as same,
//     count(*) filter (where coalesce(g.instructor_total, g.agent_total) > g.agent_total) as final_higher,
//     count(*) filter (where coalesce(g.instructor_total, g.agent_total) < g.agent_total) as final_lower,
//     sum(coalesce(g.instructor_total, g.agent_total) - g.agent_total) as points_added
//   from cse_task_grades g join cse_assignment_submissions s on s.id = g.assignment_submission_id
//   where s.course_id = :course and s.superseded_at is null and g.released_at is not null
//   group by 1, 2, 3 order by 1, 2, 3;
//
//   -- Query 2: per box and per assignment (#432: no grader version)
//   select s.assignment_number, a.item->>'name' as box,
//     count(*) filter (where (a.item->>'awarded') is null) as ai_blank,
//     count(*) filter (where (a.item->>'awarded') is not null and coalesce((i.item->>'awarded')::numeric, (a.item->>'awarded')::numeric) = (a.item->>'awarded')::numeric) as same,
//     count(*) filter (where coalesce((i.item->>'awarded')::numeric, (a.item->>'awarded')::numeric) > (a.item->>'awarded')::numeric) as final_higher,
//     count(*) filter (where coalesce((i.item->>'awarded')::numeric, (a.item->>'awarded')::numeric) < (a.item->>'awarded')::numeric) as final_lower
//   from cse_task_grades g join cse_assignment_submissions s on s.id = g.assignment_submission_id
//   cross join jsonb_array_elements(g.rubric) a(item)
//   left join lateral (select x from jsonb_array_elements(g.instructor_rubric) x where x->>'name' = a.item->>'name') i(item) on true
//   where s.course_id = :course and s.superseded_at is null and g.released_at is not null
//   group by 1, 2;
//
// Below, the same two queries written row by row, then compared with graderStats on one set of rows.

function query1(grades: GraderGradeInput[]) {
  const out = new Map<string, { tasks: number; same: number; higher: number; lower: number; pointsAdded: number }>();
  for (const g of grades.filter((row) => !row.superseded && row.releasedAt !== null)) {
    const key = `${g.assignmentNumber}|${g.model}|${g.promptVersion}`;
    const row = out.get(key) ?? { tasks: 0, same: 0, higher: 0, lower: 0, pointsAdded: 0 };
    const ai = Number(g.agentTotal);
    const final = Number(g.instructorTotal ?? g.agentTotal);
    row.tasks += 1;
    if (final === ai) row.same += 1; else if (final > ai) row.higher += 1; else row.lower += 1;
    row.pointsAdded += final - ai;
    out.set(key, row);
  }
  return out;
}
function query2(grades: GraderGradeInput[]) {
  const out = new Map<string, { blank: number; same: number; higher: number; lower: number }>();
  for (const g of grades.filter((row) => !row.superseded && row.releasedAt !== null)) {
    for (const item of g.rubric as Array<{ name: string; awarded: number | null }>) {
      const key = `${g.assignmentNumber}|${item.name}`;
      const row = out.get(key) ?? { blank: 0, same: 0, higher: 0, lower: 0 };
      const staff = (g.instructorRubric as Array<{ name: string; awarded: number }> | null)?.find((x) => x.name === item.name);
      // In SQL a comparison with a null AI box is null, so it lands in none of the three filters.
      if (item.awarded === null) row.blank += 1;
      else {
        const final = staff?.awarded ?? item.awarded;
        if (final === item.awarded) row.same += 1; else if (final > item.awarded) row.higher += 1; else row.lower += 1;
      }
      out.set(key, row);
    }
  }
  return out;
}

/** A course that gives the Nov 22 table's numbers: A2 10 / 6 / 4 / 0 / +14, A3 16 / 8 / 8 / 0 / +20. */
function nov22Rows(): GraderGradeInput[] {
  const rows: GraderGradeInput[] = [];
  const v = { model: "gpt-4o", prompt: "cse115a-grader-v3" };
  // Assignment 2: 6 same (one saved with no change), 4 higher adding 14 points.
  for (let i = 0; i < 5; i += 1) rows.push(grade({ assignment: 2, ...v }));
  rows.push(grade({ assignment: 2, ...v, staff: "same" }));
  rows.push(grade({ assignment: 2, ...v, ai: { Specs: 0, "Acceptance criteria": 0 }, staff: { Specs: 2, "Acceptance criteria": 2 } })); // +4
  rows.push(grade({ assignment: 2, ...v, ai: { Specs: 0, "Test quality": 0 }, staff: { Specs: 2, "Test quality": 2 } })); // +4
  rows.push(grade({ assignment: 2, ...v, ai: { "Test quality": 0, Scope: 0 }, staff: { "Test quality": 2, Scope: 1 } })); // +3
  rows.push(grade({ assignment: 2, ...v, ai: { "Tests pass": 0, Process: 0 }, staff: { "Tests pass": 2, Process: 1 } })); // +3
  // Assignment 3: 8 same (one changes two boxes but not the total), 8 higher adding 20 points.
  for (let i = 0; i < 7; i += 1) rows.push(grade({ assignment: 3, ...v }));
  rows.push(grade({ assignment: 3, ...v, ai: { Specs: 1 }, staff: { Specs: 2, "Acceptance criteria": 1 } }));
  for (let i = 0; i < 4; i += 1) rows.push(grade({ assignment: 3, ...v, ai: { Specs: 0, "Test quality": 1 }, staff: { Specs: 2, "Test quality": 2 } })); // +3 each
  for (let i = 0; i < 4; i += 1) rows.push(grade({ assignment: 3, ...v, ai: { Specs: 0 }, staff: { Specs: 2 } })); // +2 each
  return rows;
}

describe("graderStats matches the two agreement queries", () => {
  it("reproduces the Nov 22 table on made-up rows", () => {
    const stats = statsOf(nov22Rows());
    const pick = (row: GraderStats["quarter"]["totals"][number]) => [row.assignment, row.model, row.promptVersion, row.released, row.same, row.higher, row.lower, row.pointsAdded];
    expect(stats.byAssignment.map((item) => pick(item.totals[0]!))).toEqual([
      [2, "gpt-4o", "cse115a-grader-v3", 10, 6, 4, 0, 14],
      [3, "gpt-4o", "cse115a-grader-v3", 16, 8, 8, 0, 20],
    ]);
  });

  it("equals Query 1 and Query 2 on mixed rows, apart from the regraded-after-release rows the queries include", () => {
    const rows = [
      ...nov22Rows(),
      grade({ assignment: 3, model: "model-b", prompt: "prompt-v4", ai: { Scope: null }, staff: { Scope: 1 } }),
      grade({ assignment: 3, model: "model-b", prompt: "prompt-v4", ai: { Process: "missing" } }),
      grade({ assignment: 3, model: "model-b", prompt: "prompt-v4", staff: { "Tests pass": 1 } }),
      grade({ assignment: 4, superseded: true, staff: { Scope: 0 } }),
      grade({ assignment: 4, released: false, staff: { Scope: 0 } }),
      grade({ assignment: 4, regradedAfter: true, staff: { Specs: 0 } }),
      grade({ assignment: 4, regradedAfter: true }),
      grade({ assignment: 4 }),
    ];
    const stats = statsOf(rows);
    const q1 = query1(rows);
    const q2 = query2(rows);
    const regraded = rows.filter((row) => !row.superseded && row.releasedAt && Date.parse(row.gradedAt) > Date.parse(row.releasedAt));
    expect(regraded).toHaveLength(2);
    expect(stats.regradedAfterRelease).toBe(2);
    // Without the regraded rows, every group is equal.
    const q1Clean = query1(rows.filter((row) => !regraded.includes(row)));
    const q2Clean = query2(rows.filter((row) => !regraded.includes(row)));
    const versionRows = stats.byAssignment.flatMap((item) => item.totals.filter((row) => row.model !== null));
    for (const row of versionRows) {
      const key = `${row.assignment}|${row.model}|${row.promptVersion}`;
      expect({ tasks: row.released, same: row.same, higher: row.higher, lower: row.lower, pointsAdded: row.pointsAdded }).toEqual(q1Clean.get(key));
    }
    expect(versionRows).toHaveLength(q1Clean.size);
    for (const scope of stats.byAssignment) {
      for (const row of scope.boxes) {
        const q = q2Clean.get(`${row.assignment}|${row.box}`) ?? { blank: 0, same: 0, higher: 0, lower: 0 };
        // Query 2 has no row for a box missing from the stored rubric; graderStats counts it as blank.
        const missing = rows.filter((g) => !regraded.includes(g) && !g.superseded && g.releasedAt && g.assignmentNumber === row.assignment
          && !(g.rubric as Array<{ name: string }>).some((item) => item.name === row.box)).length;
        expect({ blank: row.blank - missing, same: row.same, higher: row.higher, lower: row.lower }).toEqual(q);
      }
    }
    // With them, the queries' assignment 4 has the 2 extra tasks and nothing else differs.
    expect(q1.get("4|model-a|prompt-v1")!.tasks).toBe(q1Clean.get("4|model-a|prompt-v1")!.tasks + 2);
    expect([...q1.keys()].filter((key) => !key.startsWith("4|")).every((key) => JSON.stringify(q1.get(key)) === JSON.stringify(q1Clean.get(key)))).toBe(true);
    expect(q2.size).toBe(q2Clean.size);
  });
});

// ---- 2. The page's wording ----

const COURSE_NAME = { title: "CSE 115A", term: "Fall 2026" };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the Grader page", () => {
  it("shows the intro, the three limits, every table, the regraded line and the time lines", () => {
    const stats = statsOf(Array.from({ length: 12 }, (_, index) => grade({ staff: index < 3 ? { Specs: 1 } : null })),
      [{ key: "s", assignmentNumber: 2, submittedAt: "2026-10-08T12:00:00Z", superseded: false, taskCount: 12 }]);
    const html = text(renderToStaticMarkup(createElement(GraderView, { course: { title: "CSE 115A", term: "Fall 2026" }, stats })));
    for (const line of [GRADER_TEXT.intro, ...GRADER_TEXT.limits, GRADER_TEXT.totalsHeading, GRADER_TEXT.totalsNote, GRADER_TEXT.boxesHeading,
      GRADER_TEXT.boxesNote, GRADER_TEXT.aiGaveHeading, GRADER_TEXT.aiGaveNote, GRADER_TEXT.progressHeading, GRADER_TEXT.progressNote,
      GRADER_TEXT.timeHeading, GRADER_TEXT.timeNote, GRADER_TEXT.noTimer, regradedLine(0), ...boxExtremesLines("Fall 2026", stats.byAssignment[0]!), boxSourcesLine(stats.quarter.boxes)]) {
      expect(html).toContain(line);
    }
    expect(html).toContain("Waiting time, not grading time");
    expect(html).toContain("Fall 2026 · Assignment 2 · model-a · prompt-v1");
    expect(html).not.toContain(GRADER_TEXT.empty);
  });

  it("has an empty state for a course with no released grades, and one with nothing submitted", () => {
    const unreleased = text(renderToStaticMarkup(createElement(GraderView, { course: COURSE_NAME, stats: statsOf([grade({ released: false })]) })));
    expect(unreleased).toContain(GRADER_TEXT.empty);
    expect(unreleased).not.toContain(GRADER_TEXT.totalsNote);
    expect(unreleased).toContain(GRADER_TEXT.aiGaveHeading);
    const none = text(renderToStaticMarkup(createElement(GraderView, { course: COURSE_NAME, stats: statsOf([]) })));
    expect(none).toContain(GRADER_TEXT.nothingYet);
    expect(none).not.toContain(GRADER_TEXT.aiGaveHeading);
  });

  it("signs points added", () => {
    expect([signedPoints(14), signedPoints(-2), signedPoints(0), signedPoints(0.5)]).toEqual(["+14", "−2", "0", "+0.5"]);
  });

  it("has a Grader link between Benchmark and Staff on the staff home page", () => {
    const home = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/InstructorHome.tsx"), "utf8");
    const order = ["/benchmark`}", "/grader`}", "/staff`}"].map((needle) => home.indexOf(needle));
    expect(order.every((index) => index > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(home).toContain(">Grader</Link>");
  });
});

// ---- 3. The route ----

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  identity: null as null | { userId: string; email: string; githubLogin: null },
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  requests: [] as Array<{ table: string; rows: number }>,
}));

/** Like PostgREST: at most 1,000 rows per request, `range` pages, `in` and `eq` filter. */
function fakeQuery(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let range: [number, number] = [0, 999];
  const result = () => {
    const matched = (state.tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
    const page = matched.slice(range[0], Math.min(range[1], range[0] + 999) + 1);
    state.requests.push({ table, rows: page.length });
    return { data: page, error: null };
  };
  const query = {
    select: () => query,
    order: () => query,
    eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
    range: (from: number, to: number) => { range = [from, to]; return query; },
    maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({ isSupabaseConfigured: () => true, getSupabase: () => ({ from: fakeQuery }) }));
vi.mock("@/lib/supabase/server-user", () => ({ createUserSupabaseServerClient: async () => ({}) }));
vi.mock("@/lib/cse115a/server", async () => {
  // The real staff check, over the fake tables; only the sign-in is faked.
  const roles = () => state.tables.cse_course_roles ?? [];
  return {
    getCourseIdentity: async () => state.identity,
    requireCourseStaff: async (identity: { email: string }, slug: string, options: { instructorOnly?: boolean } = {}) => {
      const course = (state.tables.cse_courses ?? []).find((row) => row.slug === slug);
      const role = roles().find((row) => row.email === identity.email.toLowerCase() && row.course_id === course?.id)?.role;
      if (!course || !role || (options.instructorOnly && role !== "instructor")) return null;
      return { ...course, role };
    },
    requireSubmissionStaff: async () => null,
  };
});

const COURSE = { id: "course-1", slug: "CSE115A-Test", title: "CSE 115A", term: "Fall 2026", assignment_count: 5, active: true };
const TA = { userId: "staff-1", email: "ta@example.edu", githubLogin: null };
const STUDENT = { userId: "student-1", email: "student-a@example.edu", githubLogin: null };

/** Submissions and grade rows for the route, with ids, emails and task IDs that must not come back. */
function seed(submissionCount: number) {
  const submissions: Row[] = [];
  const grades: Row[] = [];
  for (let i = 0; i < submissionCount; i += 1) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    submissions.push({
      id, course_id: COURSE.id, user_id: `user-${i}`, assignment_number: 2 + (i % 2), submitted_at: "2026-10-08T12:00:00Z",
      superseded_at: i === 0 ? "2026-10-09T00:00:00Z" : null, slot_1: 1, slot_2: 2, slot_3: null, slot_4: null, slot_5: null, slot_6: null,
    });
    for (const slot of [1, 2]) {
      // Submission 1 (current, released) has Specs lowered on both tasks, so its id is on the route's lists.
      const g = grade({ released: i % 3 !== 0, staff: i % 4 === 1 ? { Specs: 1 } : null, model: "model-a", prompt: "prompt-v1" });
      grades.push({
        assignment_submission_id: id, task_slot: slot, task_id: `TEAM-${i}-${slot}`, pr_url: `https://github.com/example-org/repo-${i}/pull/${i}`,
        rubric: g.rubric, agent_total: g.agentTotal, model: g.model, prompt_version: g.promptVersion, graded_at: g.gradedAt,
        instructor_rubric: g.instructorRubric, instructor_total: g.instructorTotal, instructor_notes: "made-up note", released_at: g.releasedAt,
      });
    }
  }
  state.tables = {
    cse_courses: [COURSE, { ...COURSE, id: "course-2", slug: "OTHER-Test" }],
    cse_course_roles: [{ course_id: COURSE.id, email: TA.email, role: "ta" }],
    cse_assignment_submissions: [...submissions, { id: "other-sub", course_id: "course-2", assignment_number: 2, submitted_at: "2026-10-08T12:00:00Z", superseded_at: null }],
    cse_task_grades: [...grades, { ...grades[1], assignment_submission_id: "other-sub" }],
  };
  return { submissions, grades };
}

async function callRoute(slug = COURSE.slug) {
  const { GET } = await import("@/app/api/cse115a/instructor/courses/[slug]/grader-stats/route");
  return GET(new Request("http://localhost/x"), { params: Promise.resolve({ slug }) });
}

describe("GET /api/cse115a/instructor/courses/[slug]/grader-stats", () => {
  beforeEach(() => { state.identity = null; state.requests = []; seed(4); });

  it("refuses a signed-out caller (401) and a signed-in student (403)", async () => {
    expect((await callRoute()).status).toBe(401);
    state.identity = STUDENT;
    expect((await callRoute()).status).toBe(403);
  });

  it("refuses staff of another course", async () => {
    state.identity = TA;
    expect((await callRoute("OTHER-Test")).status).toBe(403);
  });

  // #432: the answer now holds, for each changed task, its submission id and task slot (the link's address), and the
  // course's title and term. Still no email, user id, repo, PR number, task ID, note or rationale.
  it("answers course staff (a TA) with counts, the term, and only the submission id and slot of changed tasks", async () => {
    state.identity = TA;
    const response = await callRoute();
    expect(response.status).toBe(200);
    const raw = await response.text();
    const body = JSON.parse(raw) as GraderStatsResponse;
    expect(Object.keys(body).sort()).toEqual(["byAssignment", "comparedTasks", "course", "noSaveTime", "quarter", "regradedAfterRelease"]);
    expect(body.course).toEqual({ title: "CSE 115A", term: "Fall 2026" });
    const changedSub = "00000000-0000-4000-8000-000000000001";
    const specs = body.quarter.boxes.find((row) => row.box === "Specs")!;
    expect(specs.lowerTasks).toEqual([
      { submissionId: changedSub, taskSlot: 1, assignment: 3, ai: 2, final: 1 },
      { submissionId: changedSub, taskSlot: 2, assignment: 3, ai: 2, final: 1 },
    ]);
    expect(body.byAssignment.find((item) => item.assignment === 3)!.totals.at(-1)!.lowerTasks).toEqual([
      { submissionId: changedSub, taskSlot: 1, assignment: 3, ai: 10, final: 9 },
      { submissionId: changedSub, taskSlot: 2, assignment: 3, ai: 10, final: 9 },
    ]);
    const keys = new Set<string>();
    const values: unknown[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { keys.add(key); walk(inner); }
      else values.push(value);
    };
    walk(body);
    for (const key of [...keys].filter((item) => item !== "submissionId")) expect(key).not.toMatch(/(^|_)id$|Id$|email|user|repo|^pr($|_|N)|url|task_?id|note|rationale|key/i);
    expect(keys.has("submissionId") && keys.has("taskSlot")).toBe(true);
    // #442: the "What the AI gave" lists add the id of every current submission with a graded task (here 1 to 3;
    // submission 0 is superseded and "other-sub" is another course's).
    const currentSubs = [1, 2, 3].map((i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const allowedStrings = new Set<unknown>(["model-a", "prompt-v1", "llm", "evidence", "CSE 115A", "Fall 2026", ...currentSubs, ...RUBRIC.map((row) => row.name)]);
    for (const value of values) {
      if (typeof value === "string") expect(allowedStrings.has(value)).toBe(true);
      else expect(value === null || typeof value === "number").toBe(true);
    }
    expect(raw).not.toMatch(/user-|@|example|github|TEAM-|pull|made-up|course-|slot_/);
    // The only ids are those of current submissions of this course (#442; before it, only those with a changed task).
    expect([...raw.matchAll(/00000000-[0-9a-f-]+/g)].every((match) => currentSubs.includes(match[0]))).toBe(true);
    expect(raw).not.toContain("00000000-0000-4000-8000-000000000000");
    expect(raw).not.toContain("other-sub");
  });

  it("reads every row past 1,000: 1,099 current submissions and over 1,000 current grade rows", async () => {
    const { submissions, grades } = seed(1100);
    state.identity = TA;
    const body = await (await callRoute()).json() as GraderStatsResponse;
    const currentGrades = grades.filter((g) => submissions.find((s) => s.id === g.assignment_submission_id)!.superseded_at === null);
    expect(body.byAssignment.reduce((sum, item) => sum + item.progress.graded, 0)).toBe(currentGrades.length);
    expect(body.quarter.progress.graded).toBe(currentGrades.length);
    expect(body.quarter.progress.submitted).toBe((submissions.length - 1) * 2);
    expect(body.quarter.aiGave[0]!.full).toBe(currentGrades.length);
    // allRows asks for 500 at a time, under the 1,000-row cap, until a short page.
    expect(state.requests.filter((r) => r.table === "cse_assignment_submissions").map((r) => r.rows)).toEqual([500, 500, 100]);
    expect(currentGrades.length).toBeGreaterThan(1000);
  });

  it("selects only the named columns", () => {
    const loader = readFileSync(path.resolve(__dirname, "../lib/cse115a/loadGraderStats.ts"), "utf8");
    expect(loader).toContain('"assignment_submission_id,task_slot,rubric,agent_total,model,prompt_version,graded_at,instructor_rubric,instructor_total,released_at,instructor_saved_at,instructor_saw_graded_at"');
    expect(loader).toContain('"assignment_submission_id,task_slot,rubric,agent_total,model,prompt_version,graded_at"');
    expect(loader).toContain("id,assignment_number,submitted_at,superseded_at,${SNAPSHOT_SLOT_PATHS}");
    expect(loader).not.toMatch(/select\("\*"\)|instructor_notes|user_id|snapshot"/);
  });
});

// ---- 4. Nothing student-facing imports it ----

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("student code does not import the Grader numbers", () => {
  it("no student API route or student page component imports graderStats, loadGraderStats, the route or the panel", () => {
    const root = path.resolve(__dirname, "..");
    const student = [
      ...filesUnder(path.join(root, "app/api/cse115a")).filter((file) => !file.includes(`${path.sep}instructor${path.sep}`)),
      ...filesUnder(path.join(root, "app/cse115a")).filter((file) => !file.includes(`${path.sep}instructor${path.sep}`)),
      ...filesUnder(path.join(root, "components/cse115a")).filter((file) => !file.includes(`${path.sep}instructor${path.sep}`)),
    ];
    expect(student.length).toBeGreaterThan(10);
    for (const file of student) expect(readFileSync(file, "utf8")).not.toMatch(/graderStats|loadGraderStats|grader-stats|GraderPanel/);
  });
});

// ---- 5. By assignment or whole quarter, the term, and the changed tasks (#432) ----

const FALL = { title: "CSE 115A", term: "Fall 2026" };
const render = (stats: GraderStats, initialScope?: "assignment" | "quarter") =>
  renderToStaticMarkup(createElement(GraderView, { course: FALL, stats, initialScope }));
/** The page's text cut at each section heading, so each table can be checked on its own. */
function sections(html: string): Record<string, string> {
  const shown = text(html);
  const heads = [GRADER_TEXT.totalsHeading, GRADER_TEXT.boxesHeading, GRADER_TEXT.aiGaveHeading, GRADER_TEXT.progressHeading, GRADER_TEXT.timeHeading];
  const at = heads.map((heading) => shown.indexOf(` ${heading} `));
  expect(at.every((index) => index > 0)).toBe(true);
  return Object.fromEntries(heads.map((heading, index) => [heading, shown.slice(at[index]!, at[index + 1] ?? undefined)]));
}

/** A made-up course over two assignments and two grader versions, with every kind of task. */
function mixedCourse() {
  return [
    grade({ assignment: 2, key: "sub-a", slot: 1 }), // same
    grade({ assignment: 2, key: "sub-a", slot: 2, ai: { Specs: 1 }, staff: { Specs: 2 } }), // Specs raised
    grade({ assignment: 2, key: "sub-b", slot: 1, model: "model-b", prompt: "prompt-v2", staff: { Scope: 0.5 } }), // Scope lowered
    grade({ assignment: 3, key: "sub-c", slot: 2, ai: { "Test quality": null }, staff: { "Test quality": 2 } }), // blank, filled
    grade({ assignment: 3, key: "sub-c", slot: 1, staff: "same" }), // saved, same
    grade({ assignment: 3, key: "sub-d", slot: 1, regradedAfter: true, staff: { Specs: 0 } }), // regraded after release
    grade({ assignment: 3, key: "sub-old", slot: 1, superseded: true, staff: { Specs: 0, Scope: 0 } }), // superseded
    grade({ assignment: 3, key: "sub-e", slot: 1, released: false, staff: { Specs: 0 } }), // not released
  ];
}
const submissionsOf = (): GraderSubmissionInput[] => [
  { key: "sub-a", assignmentNumber: 2, submittedAt: "2026-10-08T12:00:00Z", superseded: false, taskCount: 2 },
  { key: "sub-b", assignmentNumber: 2, submittedAt: "2026-10-08T12:00:00Z", superseded: false, taskCount: 1 },
  { key: "sub-c", assignmentNumber: 3, submittedAt: "2026-10-09T12:00:00Z", superseded: false, taskCount: 2 },
  { key: "sub-d", assignmentNumber: 3, submittedAt: "2026-10-08T12:00:00Z", superseded: false, taskCount: 1 },
  { key: "sub-old", assignmentNumber: 3, submittedAt: "2026-10-01T12:00:00Z", superseded: true, taskCount: 1 },
  { key: "sub-e", assignmentNumber: 3, submittedAt: "2026-10-08T12:00:00Z", superseded: false, taskCount: 1 },
];

describe("#432: both groupings", () => {
  it("the assignments summed give the quarter, in every table", () => {
    const stats = statsOf([...mixedCourse(), ...nov22Rows()], submissionsOf());
    const sum = <T,>(pick: (item: GraderStats["quarter"]) => T, keys: Array<keyof T>) =>
      Object.fromEntries(keys.map((key) => [key, Math.round(stats.byAssignment.reduce((total, item) => total + Number(pick(item)[key]), 0) * 100) / 100]));
    const totalsKeys = ["released", "same", "higher", "lower", "pointsAdded", "accepted"] as const;
    const scopeRow = (item: GraderStats["quarter"]) => item.totals[item.totals.length - 1]!;
    expect(sum(scopeRow, [...totalsKeys])).toEqual(Object.fromEntries(totalsKeys.map((key) => [key, scopeRow(stats.quarter)[key]])));
    // Each grader version's quarter row is that version's assignment rows summed.
    for (const row of stats.quarter.totals.filter((item) => item.model !== null)) {
      const parts = stats.byAssignment.flatMap((item) => item.totals.filter((part) => part.model === row.model && part.promptVersion === row.promptVersion));
      expect(parts.reduce((total, part) => total + part.released, 0)).toBe(row.released);
      expect(parts.reduce((total, part) => total + part.higher, 0)).toBe(row.higher);
    }
    const boxKeys = ["tasks", "blank", "same", "higher", "lower", "needsReview", "pointsAdded"] as const;
    stats.quarter.boxes.forEach((row, index) => {
      expect(sum((item) => item.boxes[index]!, [...boxKeys])).toEqual(Object.fromEntries(boxKeys.map((key) => [key, row[key]])));
      expect(row.higherTasks).toEqual(stats.byAssignment.flatMap((item) => item.boxes[index]!.higherTasks));
    });
    const gaveKeys = ["full", "half", "zero", "blank", "other"] as const;
    stats.quarter.aiGave.forEach((row, index) => expect(sum((item) => item.aiGave[index]!, [...gaveKeys])).toEqual(Object.fromEntries(gaveKeys.map((key) => [key, row[key]]))));
    const progressKeys = ["submitted", "graded", "savedNotReleased", "released", "regradedAfterRelease"] as const;
    expect(sum((item) => item.progress, [...progressKeys])).toEqual(stats.quarter.progress);
    expect(sum((item) => item.waiting, ["submissions"])).toEqual({ submissions: stats.quarter.waiting.submissions });
  });

  it("splits What the AI gave by assignment", () => {
    const stats = statsOf([grade({ assignment: 2 }), grade({ assignment: 3, ai: { Specs: 1 } }), grade({ assignment: 3, released: false, ai: { Specs: 0 } })]);
    const specs = (item: GraderStats["quarter"]) => item.aiGave.find((row) => row.box === "Specs")!;
    expect(stats.byAssignment.map((item) => [item.assignment, specs(item).full, specs(item).half, specs(item).zero])).toEqual([[2, 1, 0, 0], [3, 0, 1, 1]]);
    expect(specs(stats.quarter)).toMatchObject({ full: 1, half: 1, zero: 1 });
  });

  it("the quarter's waiting time is the median over every released submission, not a median of medians", () => {
    const hours = (n: number) => new Date(Date.parse("2026-10-08T00:00:00Z") + n * 3_600_000).toISOString();
    const submittedAt = hours(0);
    const stats = statsOf([
      grade({ assignment: 2, key: "a", submittedAt, releasedAt: hours(10) }),
      grade({ assignment: 3, key: "b", submittedAt, releasedAt: hours(20) }),
      grade({ assignment: 3, key: "c", submittedAt, releasedAt: hours(30) }),
      grade({ assignment: 3, key: "d", submittedAt, releasedAt: hours(90) }),
    ]);
    expect(waitingOf(stats).map((row) => row.medianMs)).toEqual([10 * 3_600_000, 30 * 3_600_000]);
    expect(stats.quarter.waiting).toEqual({ submissions: 4, medianMs: 25 * 3_600_000 });
  });
});

describe("#432: the changed tasks", () => {
  const stats = statsOf(mixedCourse(), submissionsOf());
  const quarterBox = (name: CriterionName) => box(stats, name);

  it("lists a raised box, a lowered box and a blank box, and leaves out same, regraded-after-release, superseded and unreleased tasks", () => {
    expect(quarterBox("Specs")).toMatchObject({
      higherTasks: [{ submissionId: "sub-a", taskSlot: 2, assignment: 2, ai: 1, final: 2 }], lowerTasks: [], blankTasks: [],
    });
    expect(quarterBox("Scope")).toMatchObject({
      higherTasks: [], lowerTasks: [{ submissionId: "sub-b", taskSlot: 1, assignment: 2, ai: 1, final: 0.5 }], blankTasks: [],
    });
    expect(quarterBox("Test quality")).toMatchObject({
      higher: 0, blank: 1, higherTasks: [], lowerTasks: [], blankTasks: [{ submissionId: "sub-c", taskSlot: 2, assignment: 3, ai: null, final: 2 }],
    });
    const listed = stats.quarter.boxes.flatMap((row) => [...row.higherTasks, ...row.lowerTasks, ...row.blankTasks]);
    expect(listed.map((task) => `${task.submissionId}/${task.taskSlot}`).sort()).toEqual(["sub-a/2", "sub-b/1", "sub-c/2"]);
    // Every count with a list equals the list's length.
    for (const row of [...stats.quarter.boxes, ...stats.byAssignment.flatMap((item) => item.boxes)]) {
      expect([row.higher, row.lower, row.blank]).toEqual([row.higherTasks.length, row.lowerTasks.length, row.blankTasks.length]);
    }
  });

  it("lists the tasks whose total changed, with both totals, on the version, assignment and quarter rows", () => {
    const quarter = stats.quarter.totals[stats.quarter.totals.length - 1]!;
    expect(quarter.higherTasks).toEqual([
      { submissionId: "sub-a", taskSlot: 2, assignment: 2, ai: 9, final: 10 },
      { submissionId: "sub-c", taskSlot: 2, assignment: 3, ai: 8, final: 10 },
    ]);
    expect(quarter.lowerTasks).toEqual([{ submissionId: "sub-b", taskSlot: 1, assignment: 2, ai: 10, final: 9.5 }]);
    const a2 = stats.byAssignment[0]!.totals;
    expect(a2.map((row) => [row.model, row.higherTasks.length, row.lowerTasks.length])).toEqual([["model-a", 1, 0], ["model-b", 0, 1], [null, 1, 1]]);
  });

  it("writes each task as its assignment and task number with both scores, and links to the staff review page", () => {
    expect(changedTaskLine({ submissionId: "sub-a", taskSlot: 2, assignment: 3, ai: 1, final: 2 })).toBe("Assignment 3 · Task 2: AI 1, final 2");
    expect(changedTaskLine({ submissionId: "sub-a", taskSlot: 1, assignment: 3, ai: null, final: 2 })).toBe("Assignment 3 · Task 1: AI blank, final 2");
    expect(changedTaskLine({ submissionId: "sub-a", taskSlot: 1, assignment: 3, ai: 9.5, final: 10 })).toBe("Assignment 3 · Task 1: AI 9.5, final 10");
    expect(reviewHref({ submissionId: "00000000-0000-4000-8000-00000000000a" })).toBe("/cse115a/instructor/submissions/00000000-0000-4000-8000-00000000000a");
  });
});

describe("#432: the page", () => {
  const stats = statsOf(mixedCourse(), submissionsOf());

  it("names the term in the heading and every group label, both ways", () => {
    for (const scope of ["assignment", "quarter"] as const) {
      const shown = text(render(stats, scope));
      expect(shown).toContain("Grader · Fall 2026");
      expect(shown).toContain(quarterLine("Fall 2026"));
      // Every "Assignment N" is either a term-led group label or a task line ("Assignment N · Task M").
      for (const match of shown.matchAll(/Assignment \d+/g)) {
        const before = shown.slice(Math.max(0, match.index! - 12), match.index);
        const after = shown.slice(match.index! + match[0].length, match.index! + match[0].length + 8);
        expect(before.endsWith("Fall 2026 · ") || after.startsWith(" · Task")).toBe(true);
      }
      for (const match of shown.matchAll(/all assignments/g)) expect(shown.slice(match.index! - 12, match.index)).toBe("Fall 2026 · ");
    }
    expect(groupLabel("Fall 2026", { assignment: 2, model: "model-a", promptVersion: "prompt-v1" })).toBe("Fall 2026 · Assignment 2 · model-a · prompt-v1");
    expect(groupLabel("Fall 2026", { assignment: null, model: null, promptVersion: null })).toBe("Fall 2026 · all assignments");
    expect(scopeLabel("Winter 2027", 4)).toBe("Winter 2027 · Assignment 4");
  });

  it("the toggle switches every table: By assignment by default, Whole quarter shows one group", () => {
    const byAssignment = render(stats);
    expect(byAssignment).toMatch(/<button type="button" aria-pressed="true"[^>]*>By assignment<\/button>/);
    expect(byAssignment).toMatch(/<button type="button" aria-pressed="false"[^>]*>Whole quarter<\/button>/);
    for (const [heading, part] of Object.entries(sections(byAssignment))) {
      expect(part, heading).toContain("Fall 2026 · Assignment 2");
      expect(part, heading).toContain("Fall 2026 · Assignment 3");
      expect(part, heading).not.toContain("all assignments");
    }
    const quarter = render(stats, "quarter");
    expect(quarter).toMatch(/aria-pressed="true"[^>]*>Whole quarter</);
    for (const [heading, part] of Object.entries(sections(quarter))) {
      expect(part, heading).toContain("Fall 2026 · all assignments");
      expect(part, heading).not.toMatch(/Fall 2026 · Assignment \d/);
    }
    // Totals keeps its grader versions both ways; the box table has none.
    expect(sections(quarter)[GRADER_TEXT.totalsHeading]).toContain("Fall 2026 · all assignments · model-b · prompt-v2");
    expect(sections(byAssignment)[GRADER_TEXT.boxesHeading]).not.toContain("model-");
  });

  it("renders each list as links to the review page, hidden behind a button, and no button or list for a 0", () => {
    const html = render(stats);
    expect(html).toContain('<a class="text-primary underline" href="/cse115a/instructor/submissions/sub-a">Assignment 2 · Task 2: AI 1, final 2</a>');
    expect(html).toContain('href="/cse115a/instructor/submissions/sub-c">Assignment 3 · Task 2: AI blank, final 2</a>');
    expect(html).toContain('href="/cse115a/instructor/submissions/sub-b">Assignment 2 · Task 1: AI 1, final 0.5</a>');
    // Each button controls a list row that is hidden until opened, and every list row has its button.
    const controls = [...html.matchAll(/aria-expanded="false" aria-controls="([^"]+)"/g)].map((match) => match[1]!);
    const lists = [...html.matchAll(/<tr id="([^"]+)" hidden=""/g)].map((match) => match[1]!);
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.sort()).toEqual(lists.sort());
    // As many buttons as non-zero changed-task cells: Totals (higher, lower) and boxes (blank, higher, lower), by assignment;
    // since #442 also What the AI gave (full, half, zero, blank), by assignment.
    const expected = stats.byAssignment.filter((item) => item.comparedTasks > 0).reduce((count, item) =>
      count + item.totals.reduce((n, row) => n + Number(row.higher > 0) + Number(row.lower > 0), 0)
      + item.boxes.reduce((n, row) => n + Number(row.higher > 0) + Number(row.lower > 0) + Number(row.blank > 0), 0), 0)
      + stats.byAssignment.reduce((count, item) =>
        count + item.aiGave.reduce((n, row) => n + Number(row.full > 0) + Number(row.half > 0) + Number(row.zero > 0) + Number(row.blank > 0), 0), 0);
    expect(controls).toHaveLength(expected);
    // A box with nothing changed shows plain zeros and no list.
    expect(text(html)).not.toContain(changedListHeading("higher", "Process, Fall 2026 · Assignment 2"));
    expect(text(html)).toContain(changedListHeading("higher", "Specs, Fall 2026 · Assignment 2"));
    // Regraded-after-release and unreleased tasks are in no changed-task list; since #442 What the AI gave, which
    // counts every current graded task, lists them. A superseded task is nowhere.
    expect(html.slice(0, html.indexOf(`>${GRADER_TEXT.aiGaveHeading}<`))).not.toMatch(/sub-old|sub-d|sub-e/);
    expect(html).not.toContain("sub-old");
    expect(text(html)).toContain(GRADER_TEXT.links);
  });

  it("keeps #429's limit lines and the no-save-time line; the review page has no per-task address, so links open the submission", () => {
    expect(GRADER_TEXT.limits).toHaveLength(4);
    expect(GRADER_TEXT.limits[3]).toBe("The reason for a change is not stored.");
    expect(text(render(stats))).toContain(noSaveTimeLine(stats.noSaveTime, stats.comparedTasks));
    const review = readFileSync(path.resolve(__dirname, "../components/cse115a/instructor/SubmissionReview.tsx"), "utf8");
    expect(review).not.toMatch(/location\.hash|scrollIntoView|searchParams/);
  });
});

// ---- 6. The counts in "What the AI gave" open their tasks (#442) ----

/** A made-up course for What the AI gave: every kind of AI box, two assignments, and tasks that must be in no list. */
function aiGaveCourse() {
  return [
    grade({ assignment: 2, key: "sub-p", slot: 1 }), // every box full
    grade({ assignment: 2, key: "sub-p", slot: 2, ai: { Specs: 1, Scope: 0.5 } }), // Specs half, Scope half
    grade({ assignment: 2, key: "sub-q", slot: 1, ai: { Specs: 0, Scope: null }, released: false }), // Specs zero, Scope blank, unreleased
    grade({ assignment: 3, key: "sub-r", slot: 2, ai: { Specs: null }, staff: { Specs: 2 } }), // Specs blank, staff filled it
    grade({ assignment: 3, key: "sub-r", slot: 1, ai: { Specs: 1.5 } }), // Specs "other": in no list
    grade({ assignment: 3, key: "sub-t", slot: 1, ai: { Specs: "missing" }, regradedAfter: true }), // older row, no Specs box: blank
    grade({ assignment: 3, key: "sub-gone", slot: 1, superseded: true, ai: { Specs: 0 } }), // superseded: in no list
  ];
}
const KINDS = ["full", "half", "zero", "blank"] as const;
const listOf = (row: GraderStats["quarter"]["aiGave"][number], kind: (typeof KINDS)[number]) => row[`${kind}Tasks`];
const specsGave = (item: GraderStats["quarter"]) => item.aiGave.find((row) => row.box === "Specs")!;

describe("#442: What the AI gave lists its tasks", () => {
  const stats = statsOf(aiGaveCourse());

  it("lists the tasks behind each count, newest AI grade, released or not, current attempts only", () => {
    const specs = specsGave(stats.quarter);
    expect(specs).toMatchObject({ full: 1, half: 1, zero: 1, blank: 2, other: 1 });
    expect(specs.fullTasks).toEqual([{ submissionId: "sub-p", taskSlot: 1, assignment: 2, ai: 2 }]);
    expect(specs.halfTasks).toEqual([{ submissionId: "sub-p", taskSlot: 2, assignment: 2, ai: 1 }]);
    expect(specs.zeroTasks).toEqual([{ submissionId: "sub-q", taskSlot: 1, assignment: 2, ai: 0 }]);
    expect(specs.blankTasks).toEqual([
      { submissionId: "sub-r", taskSlot: 2, assignment: 3, ai: null },
      { submissionId: "sub-t", taskSlot: 1, assignment: 3, ai: null },
    ]);
    expect(stats.quarter.aiGave.find((row) => row.box === "Scope")!.halfTasks).toEqual([{ submissionId: "sub-p", taskSlot: 2, assignment: 2, ai: 0.5 }]);
    const everyListed = [stats.quarter, ...stats.byAssignment].flatMap((item) => item.aiGave.flatMap((row) => KINDS.flatMap((kind) => listOf(row, kind))));
    expect(everyListed.some((task) => task.submissionId === "sub-gone")).toBe(false);
  });

  it("every count equals its list's length, in every scope and box", () => {
    for (const item of [stats.quarter, ...stats.byAssignment]) {
      for (const row of item.aiGave) for (const kind of KINDS) expect(listOf(row, kind), `${row.box} ${kind}`).toHaveLength(row[kind]);
    }
  });

  it("the assignments' lists add up to the quarter's", () => {
    stats.quarter.aiGave.forEach((row, index) => {
      for (const kind of KINDS) {
        const parts = stats.byAssignment.flatMap((item) => listOf(item.aiGave[index]!, kind));
        expect(parts, `${row.box} ${kind}`).toEqual(listOf(row, kind));
      }
    });
  });

  it("each list holds only the submission id, task slot, assignment and the AI's points", () => {
    for (const row of stats.quarter.aiGave) {
      for (const kind of KINDS) for (const task of listOf(row, kind)) expect(Object.keys(task).sort()).toEqual(["ai", "assignment", "submissionId", "taskSlot"]);
    }
  });

  it("writes a line as the AI's points out of the box's, or blank, and heads a list with what it holds", () => {
    expect(aiGaveTaskLine({ submissionId: "sub-p", taskSlot: 2, assignment: 3, ai: 1 }, 2)).toBe("Assignment 3 · Task 2: AI 1 of 2");
    expect(aiGaveTaskLine({ submissionId: "sub-p", taskSlot: 1, assignment: 2, ai: 0.5 }, 1)).toBe("Assignment 2 · Task 1: AI 0.5 of 1");
    expect(aiGaveTaskLine({ submissionId: "sub-p", taskSlot: 1, assignment: 2, ai: 0 }, 2)).toBe("Assignment 2 · Task 1: AI 0 of 2");
    expect(aiGaveTaskLine({ submissionId: "sub-r", taskSlot: 2, assignment: 3, ai: null }, 2)).toBe("Assignment 3 · Task 2: AI blank");
    expect(aiGaveListHeading("full", "Specs, Fall 2026 · Assignment 3")).toBe("AI gave full: Specs, Fall 2026 · Assignment 3");
    expect(aiGaveListHeading("half", "Specs, Fall 2026 · Assignment 3")).toBe("AI gave half: Specs, Fall 2026 · Assignment 3");
    expect(aiGaveListHeading("zero", "Specs, Fall 2026 · Assignment 3")).toBe("AI gave zero: Specs, Fall 2026 · Assignment 3");
    expect(aiGaveListHeading("blank", "Specs, Fall 2026 · Assignment 3")).toBe("AI gave no score: Specs, Fall 2026 · Assignment 3");
  });
});

describe("#442: the What the AI gave buttons and lists on the page", () => {
  const stats = statsOf(aiGaveCourse());
  /** The What the AI gave section's markup, cut at its heading and the next. */
  const aiGaveHtml = (html: string) => html.slice(html.indexOf(`>${GRADER_TEXT.aiGaveHeading}<`), html.indexOf(`>${GRADER_TEXT.progressHeading}<`));

  for (const scope of ["assignment", "quarter"] as const) {
    it(`every non-zero Full, Half, Zero and Blank is a button over a list of that length, and a 0 has neither (${scope})`, () => {
      const html = aiGaveHtml(render(stats, scope));
      const scopes = scope === "quarter" ? [stats.quarter] : stats.byAssignment;
      const buttons = [...html.matchAll(/<button type="button" aria-expanded="false" aria-controls="([^"]+)" aria-label="([^"]+)"[^>]*>(\d+)<\/button>/g)];
      const nonZero = scopes.flatMap((item) => item.aiGave.flatMap((row) => KINDS.filter((kind) => row[kind] > 0).map((kind) => ({ item, row, kind }))));
      expect(buttons).toHaveLength(nonZero.length);
      for (const { item, row, kind } of nonZero) {
        const heading = aiGaveListHeading(kind, `${row.box}, ${scopeLabel("Fall 2026", item.assignment)}`);
        const button = buttons.find((match) => match[2] === `${row[kind]}, show the tasks: ${heading}`);
        expect(button, heading).toBeDefined();
        expect(button![3]).toBe(String(row[kind]));
        // The list row the button controls: hidden, headed, scrolling, one link per task.
        const start = html.indexOf(`<tr id="${button![1]}" hidden=""`);
        expect(start, heading).toBeGreaterThan(0);
        const listRow = html.slice(start, html.indexOf("</tr>", start));
        expect(listRow).toContain(`>${heading}</p>`);
        expect(listRow).toContain("max-h-64");
        expect(listRow).toContain("overflow-y-auto");
        const links = [...listRow.matchAll(/<a class="text-primary underline" href="([^"]+)">([^<]+)<\/a>/g)];
        expect(links).toHaveLength(row[kind]);
        expect(links.map((link) => [link[1], link[2]])).toEqual(listOf(row, kind).map((task) => [reviewHref(task), aiGaveTaskLine(task, row.points)]));
      }
      // A 0 is plain text: as many hidden list rows as buttons, and none for a zero cell.
      expect([...html.matchAll(/<tr id="[^"]+" hidden=""/g)]).toHaveLength(nonZero.length);
      const zeroHeading = aiGaveListHeading("zero", `Process, ${scopeLabel("Fall 2026", scopes[0]!.assignment)}`);
      expect(html).not.toContain(zeroHeading);
    });
  }

  it("shows the lines and headings word for word, and the note on what opens", () => {
    const html = render(stats);
    const shown = text(html);
    expect(shown).toContain(GRADER_TEXT.aiGaveNote);
    expect(GRADER_TEXT.aiGaveNote).toContain("A number under Full, Half, Zero or Blank that is not 0 opens the list of those tasks, each linked to its submission's staff review page.");
    expect(html).toContain('<a class="text-primary underline" href="/cse115a/instructor/submissions/sub-p">Assignment 2 · Task 2: AI 1 of 2</a>');
    expect(html).toContain('href="/cse115a/instructor/submissions/sub-p">Assignment 2 · Task 2: AI 0.5 of 1</a>');
    expect(html).toContain('href="/cse115a/instructor/submissions/sub-r">Assignment 3 · Task 2: AI blank</a>');
    expect(shown).toContain("AI gave half: Specs, Fall 2026 · Assignment 2");
    expect(shown).toContain("AI gave no score: Specs, Fall 2026 · Assignment 3");
    expect(html).not.toContain("sub-gone");
    // The Other column, shown because one task has 1.5 on Specs, stays a plain number.
    expect(aiGaveHtml(html)).toContain(">Other</th>");
    expect(aiGaveHtml(render(stats, "quarter"))).toContain("AI gave full: Specs, Fall 2026 · all assignments");
  });

  it("changes no number in the table: the counts are those of before #442", () => {
    const counts = (item: GraderStats["quarter"]) => item.aiGave.map((row) => [row.box, row.full, row.half, row.zero, row.blank, row.other]);
    expect(counts(stats.quarter)).toEqual([
      ["Scope", 4, 1, 0, 1, 0], ["Specs", 1, 1, 1, 2, 1], ["Acceptance criteria", 6, 0, 0, 0, 0],
      ["Test quality", 6, 0, 0, 0, 0], ["Tests pass", 6, 0, 0, 0, 0], ["Process", 6, 0, 0, 0, 0],
    ]);
  });
});

describe("#442: the route's What the AI gave lists", () => {
  beforeEach(() => { state.identity = null; state.requests = []; seed(4); });

  it("hold only the submission id, task slot, assignment and AI points, and each count equals its list", async () => {
    state.identity = TA;
    const body = await (await callRoute()).json() as GraderStatsResponse;
    for (const item of [body.quarter, ...body.byAssignment]) {
      for (const row of item.aiGave) {
        for (const kind of KINDS) {
          expect(listOf(row, kind)).toHaveLength(row[kind]);
          for (const task of listOf(row, kind)) expect(Object.keys(task).sort()).toEqual(["ai", "assignment", "submissionId", "taskSlot"]);
        }
      }
    }
    // Six current graded tasks (submissions 1 to 3, two slots each), every box full.
    expect(body.quarter.aiGave.map((row) => row.fullTasks.length)).toEqual([6, 6, 6, 6, 6, 6]);
  });
});
