import { describe, expect, it } from "vitest";
import { effectiveTotal, parseInstructorRubric, releaseBlockers, sprintScore, type TaskGradeRow } from "@/lib/cse115a/gradeReview";
import { RUBRIC, type CriterionGrade } from "@/lib/cse115a/rubric";

const full = () => RUBRIC.map((row) => ({ name: row.name as string, awarded: row.points as number, note: "" }));

function grade(slot: number, overrides: Partial<TaskGradeRow> = {}): TaskGradeRow {
  return {
    task_slot: slot,
    rubric: RUBRIC.map((row): CriterionGrade => ({ name: row.name, points: row.points, level: "full", awarded: row.points, rationale: "", evidenceQuotes: [], needsReview: false, source: "llm" })),
    agent_total: "10.00", needs_review: false, model: "m", prompt_version: "v", graded_at: "",
    instructor_rubric: null, instructor_total: null, instructor_notes: null, released_at: null,
    ...overrides,
  };
}

describe("parseInstructorRubric", () => {
  it("accepts every criterion once in half-point steps and totals it", () => {
    const rubric = full();
    rubric[1]!.awarded = 1.5;
    rubric[0]!.note = "  Tighten the scope. ";
    const parsed = parseInstructorRubric(rubric);
    expect(parsed).toMatchObject({ total: 9.5 });
    if ("rubric" in parsed) {
      expect(parsed.rubric.map((row) => row.name)).toEqual(RUBRIC.map((row) => row.name));
      expect(parsed.rubric[0]!.note).toBe("Tighten the scope.");
    }
  });

  it("rejects missing, duplicate, unknown, and out-of-range criteria", () => {
    expect(parseInstructorRubric(full().slice(1))).toEqual({ error: "Scope is missing." });
    expect(parseInstructorRubric([...full(), full()[0]])).toEqual({ error: "Scope appears twice." });
    expect(parseInstructorRubric([...full(), { name: "Style", awarded: 1 }])).toEqual({ error: "Unknown criterion: Style." });
    const tooMany = full(); tooMany[0]!.awarded = 2;
    expect(parseInstructorRubric(tooMany)).toEqual({ error: "Scope must be between 0 and 1 in steps of 0.5." });
    const fraction = full(); fraction[1]!.awarded = 1.25;
    expect("error" in parseInstructorRubric(fraction)).toBe(true);
    expect(parseInstructorRubric("nope")).toEqual({ error: "The rubric must be a list of criteria." });
  });
});

describe("release rules", () => {
  it("needs both tasks graded", () => {
    expect(releaseBlockers([grade(1)])).toEqual(["Task 2 has no grade yet."]);
    expect(releaseBlockers([grade(1), grade(2)])).toEqual([]);
  });

  it("needs points for criteria the agent left unscored, unless an instructor edited the task", () => {
    const unscored = grade(2);
    unscored.rubric[5] = { ...unscored.rubric[5]!, awarded: null, level: null, needsReview: true };
    expect(releaseBlockers([grade(1), unscored])).toEqual(["Task 2: enter points for Tests pass."]);
    expect(releaseBlockers([grade(1), { ...unscored, instructor_rubric: [] }])).toEqual([]);
  });

  it("uses instructor totals over agent totals", () => {
    expect(effectiveTotal(grade(1))).toBe(10);
    expect(effectiveTotal(grade(1, { instructor_total: "7.5" }))).toBe(7.5);
  });
});

describe("sprintScore", () => {
  it("averages the two best tasks, counting a missing task as 0", () => {
    expect(sprintScore([8, 6])).toBe(7);
    expect(sprintScore([8, 6, 10])).toBe(9);
    expect(sprintScore([8, null])).toBe(4);
    expect(sprintScore([])).toBe(0);
  });
});
