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
  boxExtremesLines, boxSourcesLine, formatDuration, graderStats, median, MIN_TASKS_FOR_EXTREMES,
  type GraderGradeInput, type GraderStats, type GraderSubmissionInput,
} from "@/lib/cse115a/graderStats";
import { GRADER_TEXT, GraderView, regradedLine, signedPoints } from "@/components/cse115a/instructor/GraderPanel";

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
  superseded?: boolean; submittedAt?: string; releasedAt?: string; key?: string;
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
const all = <T extends { assignment: number | null }>(rows: T[]) => rows.find((row) => row.assignment === null)!;
const box = (stats: GraderStats, name: CriterionName) => all(stats.boxes.find((table) => table.box === name)!.rows);

// ---- 1. The function ----

describe("graderStats: totals", () => {
  it("counts same, higher and lower totals and the points added", () => {
    const stats = statsOf([
      grade(),
      grade({ staff: { Scope: 0.5 } }),
      grade({ ai: { Specs: 1 }, staff: { Specs: 2 } }),
      grade({ ai: { Specs: 1 }, staff: { Specs: 2, "Test quality": 1 } }),
    ]);
    expect(all(stats.totals)).toMatchObject({ released: 4, same: 2, higher: 1, lower: 1, pointsAdded: 0.5, sameShare: 0.5 });
  });

  it("a box changed with the total unchanged (one up, one down): total same, the boxes higher and lower, not accepted", () => {
    const stats = statsOf([grade({ ai: { Specs: 1 }, staff: { Specs: 2, "Acceptance criteria": 1 } })]);
    expect(all(stats.totals)).toMatchObject({ same: 1, higher: 0, lower: 0, pointsAdded: 0, accepted: 0 });
    expect(box(stats, "Specs")).toMatchObject({ same: 0, higher: 1, lower: 0, pointsAdded: 1 });
    expect(box(stats, "Acceptance criteria")).toMatchObject({ same: 0, higher: 0, lower: 1, pointsAdded: -1 });
  });

  it("staff saved with no number changed counts as accepted as it stood", () => {
    expect(all(statsOf([grade({ staff: "same" })]).totals)).toMatchObject({ same: 1, accepted: 1, acceptedShare: 1 });
  });

  it("never saved also counts as accepted when no box is blank", () => {
    expect(all(statsOf([grade({ staff: null })]).totals)).toMatchObject({ same: 1, accepted: 1 });
  });

  it("a blank box filled by staff is not accepted as it stood", () => {
    const stats = statsOf([grade({ ai: { "Test quality": null }, staff: { "Test quality": 2 } })]);
    expect(all(stats.totals)).toMatchObject({ higher: 1, accepted: 0, pointsAdded: 2 });
    expect(box(stats, "Test quality")).toMatchObject({ tasks: 1, blank: 1, same: 0, higher: 0, lower: 0, pointsAdded: 2, agreedShare: null });
  });

  it("does not use 'instructor_rubric is null' for accepted: a blank box with no staff save is not accepted", () => {
    // Only reachable with an old row; the release rule normally stops it.
    expect(all(statsOf([grade({ ai: { Process: null } })]).totals).accepted).toBe(0);
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
    expect(all(stats.totals).accepted).toBe(0);
  });

  it("counts the AI's Needs review flags per box", () => {
    expect(box(statsOf([grade({ needsReview: ["Specs"] }), grade({ needsReview: ["Specs", "Scope"] })]), "Specs").needsReview).toBe(2);
  });

  it("always has all six boxes, with their source from the stored rubric", () => {
    const stats = statsOf([grade()]);
    expect(stats.boxes.map((table) => table.box)).toEqual(RUBRIC.map((row) => row.name));
    expect(stats.boxes.map((table) => table.source)).toEqual(["llm", "llm", "llm", "llm", "evidence", "evidence"]);
    expect(boxSourcesLine(stats.boxes)).toBe("The model scores Scope, Specs, Acceptance criteria and Test quality. Tests pass and Process come from recorded evidence (CI results and PR history), not the model.");
  });
});

describe("graderStats: what is left out", () => {
  it("a superseded attempt is left out of everything", () => {
    const stats = statsOf([grade({ superseded: true, staff: { Scope: 0 } }), grade()],
      [{ key: "old", assignmentNumber: 2, submittedAt: "2026-10-01T00:00:00Z", superseded: true, taskCount: 2 }]);
    expect(stats.comparedTasks).toBe(1);
    expect(all(stats.totals)).toMatchObject({ released: 1, same: 1, lower: 0 });
    expect(stats.aiGave[0]!.full).toBe(1);
    expect(stats.progress).toEqual([{ assignment: 2, submitted: 0, graded: 1, savedNotReleased: 0, released: 1, regradedAfterRelease: 0 }]);
  });

  it("an unreleased task is left out of agreement but counted in Table 3 and Progress", () => {
    const stats = statsOf([grade({ released: false, ai: { Specs: 1 }, staff: { Specs: 2 } }), grade()],
      [{ key: "x", assignmentNumber: 2, submittedAt: "2026-10-08T12:00:00Z", superseded: false, taskCount: 2 }]);
    expect(all(stats.totals).released).toBe(1);
    expect(box(stats, "Specs").tasks).toBe(1);
    expect(stats.aiGave.find((row) => row.box === "Specs")).toMatchObject({ full: 1, half: 1, zero: 0, blank: 0 });
    expect(stats.progress[0]).toEqual({ assignment: 2, submitted: 2, graded: 2, savedNotReleased: 1, released: 1, regradedAfterRelease: 0 });
  });

  it("a task regraded after release is left out of agreement and counted on its own line", () => {
    const stats = statsOf([grade({ regradedAfter: true, staff: { Scope: 0 } }), grade()]);
    expect(stats.regradedAfterRelease).toBe(1);
    expect(stats.comparedTasks).toBe(1);
    expect(all(stats.totals)).toMatchObject({ released: 1, lower: 0 });
    expect(stats.progress[0]).toMatchObject({ released: 2, regradedAfterRelease: 1 });
    expect(stats.aiGave[0]!.full).toBe(2);
    expect(regradedLine(1)).toBe("1 released task was regraded after release. Staff never saw that AI score, so it is left out of every agreement number.");
  });
});

describe("graderStats: groups", () => {
  it("two grader versions in one sprint get a row each, and the All row adds them", () => {
    const stats = statsOf([
      grade({ prompt: "prompt-v1" }), grade({ prompt: "prompt-v1", staff: { Scope: 0 } }),
      grade({ prompt: "prompt-v2", model: "model-b" }),
      grade({ assignment: 3, prompt: "prompt-v2", model: "model-b", ai: { Specs: 1 }, staff: { Specs: 2 } }),
    ]);
    expect(stats.totals.map((row) => [row.assignment, row.model, row.promptVersion, row.released, row.same, row.higher, row.lower])).toEqual([
      [2, "model-a", "prompt-v1", 2, 1, 0, 1],
      [2, "model-b", "prompt-v2", 1, 1, 0, 0],
      [3, "model-b", "prompt-v2", 1, 0, 1, 0],
      [null, null, null, 4, 2, 1, 1],
    ]);
    expect(stats.boxes[0]!.rows).toHaveLength(4);
  });
});

describe("the most- and least-agreed box lines", () => {
  it("names no winner below 10 released tasks", () => {
    const stats = statsOf(Array.from({ length: MIN_TASKS_FOR_EXTREMES - 1 }, () => grade()));
    expect(boxExtremesLines(stats)).toEqual(["Only 9 released tasks are compared, fewer than 10, so no box is named as agreed with most or least."]);
  });

  it("names the box agreed with most and least, with their numbers, from 10 tasks", () => {
    const grades = Array.from({ length: 10 }, (_, index) => grade({
      staff: { ...(index < 4 ? { "Test quality": 1 } : {}), ...(index === 0 ? { Specs: 1 } : {}) },
    }));
    expect(boxExtremesLines(statsOf(grades))).toEqual([
      "Agreed with most: Scope, 10 of 10 kept as the AI scored them (100%).",
      "Agreed with least: Test quality, 6 of 10 kept as the AI scored them (60%).",
    ]);
  });

  it("says so when every box is agreed equally", () => {
    expect(boxExtremesLines(statsOf(Array.from({ length: 10 }, () => grade())))).toEqual(["Every box the AI scored was kept as the AI scored it equally often (100%)."]);
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
    expect(stats.waiting).toEqual([{ assignment: 2, submissions: 3, medianMs: 20 * 3_600_000 }]);
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
//   -- Query 2: per box, per assignment and grader version
//   select s.assignment_number, g.model, g.prompt_version, a.item->>'name' as box,
//     count(*) filter (where (a.item->>'awarded') is null) as ai_blank,
//     count(*) filter (where (a.item->>'awarded') is not null and coalesce((i.item->>'awarded')::numeric, (a.item->>'awarded')::numeric) = (a.item->>'awarded')::numeric) as same,
//     count(*) filter (where coalesce((i.item->>'awarded')::numeric, (a.item->>'awarded')::numeric) > (a.item->>'awarded')::numeric) as final_higher,
//     count(*) filter (where coalesce((i.item->>'awarded')::numeric, (a.item->>'awarded')::numeric) < (a.item->>'awarded')::numeric) as final_lower
//   from cse_task_grades g join cse_assignment_submissions s on s.id = g.assignment_submission_id
//   cross join jsonb_array_elements(g.rubric) a(item)
//   left join lateral (select x from jsonb_array_elements(g.instructor_rubric) x where x->>'name' = a.item->>'name') i(item) on true
//   where s.course_id = :course and s.superseded_at is null and g.released_at is not null
//   group by 1, 2, 3, 4;
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
      const key = `${g.assignmentNumber}|${g.model}|${g.promptVersion}|${item.name}`;
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
    const pick = (row: GraderStats["totals"][number]) => [row.assignment, row.model, row.promptVersion, row.released, row.same, row.higher, row.lower, row.pointsAdded];
    expect(stats.totals.slice(0, 2).map(pick)).toEqual([
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
    for (const row of stats.totals.filter((item) => item.assignment !== null)) {
      const key = `${row.assignment}|${row.model}|${row.promptVersion}`;
      expect({ tasks: row.released, same: row.same, higher: row.higher, lower: row.lower, pointsAdded: row.pointsAdded }).toEqual(q1Clean.get(key));
    }
    expect(stats.totals.filter((item) => item.assignment !== null)).toHaveLength(q1Clean.size);
    for (const table of stats.boxes) {
      for (const row of table.rows.filter((item) => item.assignment !== null)) {
        const q = q2Clean.get(`${row.assignment}|${row.model}|${row.promptVersion}|${table.box}`) ?? { blank: 0, same: 0, higher: 0, lower: 0 };
        // Query 2 has no row for a box missing from the stored rubric; graderStats counts it as blank.
        const missing = rows.filter((g) => !regraded.includes(g) && !g.superseded && g.releasedAt && g.assignmentNumber === row.assignment && g.model === row.model
          && g.promptVersion === row.promptVersion && !(g.rubric as Array<{ name: string }>).some((item) => item.name === table.box)).length;
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

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the Grader page", () => {
  it("shows the intro, the three limits, every table, the regraded line and the time lines", () => {
    const stats = statsOf(Array.from({ length: 12 }, (_, index) => grade({ staff: index < 3 ? { Specs: 1 } : null })),
      [{ key: "s", assignmentNumber: 2, submittedAt: "2026-10-08T12:00:00Z", superseded: false, taskCount: 12 }]);
    const html = text(renderToStaticMarkup(createElement(GraderView, { heading: "CSE 115A · Fall 2026", stats })));
    for (const line of [GRADER_TEXT.intro, ...GRADER_TEXT.limits, GRADER_TEXT.totalsHeading, GRADER_TEXT.totalsNote, GRADER_TEXT.boxesHeading,
      GRADER_TEXT.boxesNote, GRADER_TEXT.aiGaveHeading, GRADER_TEXT.aiGaveNote, GRADER_TEXT.progressHeading, GRADER_TEXT.progressNote,
      GRADER_TEXT.timeHeading, GRADER_TEXT.timeNote, GRADER_TEXT.noTimer, regradedLine(0), ...boxExtremesLines(stats), boxSourcesLine(stats.boxes)]) {
      expect(html).toContain(line);
    }
    expect(html).toContain("Waiting time, not grading time");
    expect(html).toContain("Assignment 2 · model-a · prompt-v1");
    expect(html).not.toContain(GRADER_TEXT.empty);
  });

  it("has an empty state for a course with no released grades, and one with nothing submitted", () => {
    const unreleased = text(renderToStaticMarkup(createElement(GraderView, { heading: "x", stats: statsOf([grade({ released: false })]) })));
    expect(unreleased).toContain(GRADER_TEXT.empty);
    expect(unreleased).not.toContain(GRADER_TEXT.totalsNote);
    expect(unreleased).toContain(GRADER_TEXT.aiGaveHeading);
    const none = text(renderToStaticMarkup(createElement(GraderView, { heading: "x", stats: statsOf([]) })));
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
      const g = grade({ released: i % 3 !== 0, staff: i % 5 === 0 ? { Specs: 1 } : null, model: "model-a", prompt: "prompt-v1" });
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

  it("answers course staff (a TA) with counts only: no id, email, repo, PR number or task ID in any key or value", async () => {
    state.identity = TA;
    const response = await callRoute();
    expect(response.status).toBe(200);
    const raw = await response.text();
    const body = JSON.parse(raw) as GraderStats;
    expect(Object.keys(body).sort()).toEqual(["aiGave", "boxes", "comparedTasks", "noSaveTime", "progress", "regradedAfterRelease", "totals", "waiting"]);
    const keys = new Set<string>();
    const values: unknown[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { keys.add(key); walk(inner); }
      else values.push(value);
    };
    walk(body);
    for (const key of keys) expect(key).not.toMatch(/(^|_)id$|Id$|email|user|repo|^pr($|_|N)|url|task_?id|note|rationale|key/i);
    const allowedStrings = new Set<unknown>(["model-a", "prompt-v1", "llm", "evidence", ...RUBRIC.map((row) => row.name)]);
    for (const value of values) {
      if (typeof value === "string") expect(allowedStrings.has(value)).toBe(true);
      else expect(value === null || typeof value === "number").toBe(true);
    }
    expect(raw).not.toMatch(/00000000-|user-|@|example|github|TEAM-|pull|made-up|course-/);
  });

  it("reads every row past 1,000: 1,099 current submissions and over 1,000 current grade rows", async () => {
    const { submissions, grades } = seed(1100);
    state.identity = TA;
    const body = await (await callRoute()).json() as GraderStats;
    const currentGrades = grades.filter((g) => submissions.find((s) => s.id === g.assignment_submission_id)!.superseded_at === null);
    expect(body.progress.reduce((sum, row) => sum + row.graded, 0)).toBe(currentGrades.length);
    expect(body.progress.reduce((sum, row) => sum + row.submitted, 0)).toBe((submissions.length - 1) * 2);
    expect(body.aiGave[0]!.full).toBe(currentGrades.length);
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
