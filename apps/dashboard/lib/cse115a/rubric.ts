// The CSE 115A task rubric, shared by the results page and the grading agent.
// Source: hecate-router docs/cse115a-sprint-task-specifications.md.

export const RUBRIC = [
  { name: "Scope", points: 1, full: "Specific outcome, clear out-of-scope, real constraints", partial: "Vague title or missing scope", none: "Missing, or copied between fields", evidence: "Task title, Description, Requirements" },
  { name: "Specs", points: 2, full: "Observable behavior and edge cases; names every tested interface", partial: "Behavior stated with gaps", none: "Implementation description, or missing", evidence: "Specs section" },
  { name: "Acceptance criteria", points: 2, full: "Every item is pass/fail and checkable", partial: "Some items vague", none: "Missing or not checkable", evidence: "Acceptance criteria section" },
  { name: "Tests section", points: 1, full: "Every criterion maps to a test with setup and assertion", partial: "Some criteria unmapped", none: "Names only, or missing", evidence: "Tests section" },
  { name: "Test quality", points: 1, full: "Tests assert criteria and fail without implementation", partial: "Weak or trivial assertions", none: "Tests cannot fail", evidence: "Committed tests in the PR" },
  { name: "Tests pass", points: 2, full: "Task and existing tests pass at the done tag", partial: "Some task tests fail", none: "Tests do not run, or are missing", evidence: "CI and test run at the done tag" },
  { name: "Process", points: 1, full: "Spec first, both tags pushed, Scrum card, merged PR", partial: "A step missing or late", none: "Implementation preceded task file", evidence: "PR history, tags, and Scrum board" },
] as const;

export type CriterionName = (typeof RUBRIC)[number]["name"];
export type Level = "full" | "partial" | "none";

export const TASK_POINTS = RUBRIC.reduce((sum, row) => sum + row.points, 0);

/** Criteria the language model scores. Tests pass and Process come from recorded evidence. */
export const LLM_CRITERIA = ["Scope", "Specs", "Acceptance criteria", "Tests section", "Test quality"] as const satisfies readonly CriterionName[];

export function criterion(name: CriterionName) {
  return RUBRIC.find((row) => row.name === name)!;
}

/** Full credit is all points, partial is half, none is zero. */
export function pointsFor(name: CriterionName, level: Level): number {
  const { points } = criterion(name);
  return level === "full" ? points : level === "partial" ? points / 2 : 0;
}

export type CriterionGrade = {
  name: CriterionName;
  points: number;
  level: Level | null;
  awarded: number | null;
  rationale: string;
  evidenceQuotes: string[];
  needsReview: boolean;
  source: "llm" | "evidence";
};
