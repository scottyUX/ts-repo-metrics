// #412: up to six tasks in a sprint, every one graded, the sprint score the average of all of them. Routes run
// against fakes; nothing reaches GitHub or Supabase. Names, repos and task IDs here are made up.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  releaseBlockers, SNAPSHOT_REPO_PATHS, SNAPSHOT_SLOT_PATHS, slotsFromSnapshotPaths, snapshotSlotPathValues, sprintScore, submittedSlots,
  submittedSprintScore, type TaskGradeRow,
} from "@/lib/cse115a/gradeReview";
import {
  manyTasksConfirmText, manyTasksReviewLine, oneTaskReviewLine, releasedScoreBasis, submitAction, submitBarText, submitTasksError,
} from "@/lib/cse115a/processChecklist";
import {
  canAddTask, EXTRA_TASK_WARNING, isTaskSlot, MAX_TASKS_PER_SPRINT, nextTaskSlot, shownTaskSlots, TASK_SLOT_ERROR, TASK_SLOTS, taskSlotFromPath,
} from "@/lib/cse115a/taskSlots";
import { nextSort, SORT_KEYS, sortRows, taskColumnSlots, type SubmissionRow } from "@/components/cse115a/instructor/sortRows";
import { ownTaskConflict, type OwnTask } from "@/lib/cse115a/duplicateTask";
import { prHoldsMoreThanThisTask, prTaskFileGraderNotes, prTaskFileLines, sharedPrGraderNote } from "@/lib/cse115a/sharedPr";
import { RUBRIC, type CriterionGrade } from "@/lib/cse115a/rubric";

vi.mock("server-only", () => ({}));

// ---- The constant ----

describe("MAX_TASKS_PER_SPRINT", () => {
  it("is six, and the slots are 1 to 6", () => {
    expect(MAX_TASKS_PER_SPRINT).toBe(6);
    expect(TASK_SLOTS).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("takes slots 1 to 6 and refuses 0, 7, fractions and strings", () => {
    expect([1, 2, 3, 6].map(isTaskSlot)).toEqual([true, true, true, true]);
    expect([0, 7, -1, 2.5, NaN].map(isTaskSlot)).toEqual([false, false, false, false, false]);
    expect(isTaskSlot("3")).toBe(false);
    expect(["3", "6"].map(taskSlotFromPath)).toEqual([3, 6]);
    expect(["0", "7", "x", ""].map(taskSlotFromPath)).toEqual([null, null, null, null]);
  });
});

// ---- Scoring ----

describe("sprintScore: the average of every submitted task (#412)", () => {
  it("one task is the score; two are averaged, as before", () => {
    expect(sprintScore([7.5])).toBe(7.5);
    expect(sprintScore([8, 6])).toBe(7);
    expect(sprintScore([8.5, 7])).toBe(7.75);
  });

  it("averages all of three and of six tasks", () => {
    expect(sprintScore([9, 6, 6])).toBe(7);
    expect(sprintScore([10, 9, 8, 7, 6, 5])).toBe(7.5);
  });

  it("a low third task lowers the score: 10, 10 and 6 give 8.67", () => {
    expect(Number(sprintScore([10, 10, 6]).toFixed(2))).toBe(8.67);
    expect(sprintScore([10, 10, 6])).toBeLessThan(sprintScore([10, 10]));
  });

  it("none gives 0", () => {
    expect(sprintScore([])).toBe(0);
  });

  it("submittedSprintScore waits for every submitted slot, gaps included", () => {
    const totals = (byslot: Record<number, number>) => (slot: number) => byslot[slot] ?? null;
    expect(submittedSprintScore([1, 3, 4], totals({ 1: 9, 3: 6 }))).toBeNull();
    expect(submittedSprintScore([1, 3, 4], totals({ 1: 9, 3: 6, 4: 6 }))).toBe(7);
  });
});

describe("slots from a snapshot (#412)", () => {
  it("a snapshot with slots 1, 3 and 4", () => {
    expect(submittedSlots({ tasks: [{ slot: 4 }, { slot: 1 }, { slot: 3 }] })).toEqual([1, 3, 4]);
  });

  it("every slot up to six, nothing past it", () => {
    expect(submittedSlots({ tasks: TASK_SLOTS.map((slot) => ({ slot })) })).toEqual([1, 2, 3, 4, 5, 6]);
    expect(submittedSlots({ tasks: [{ slot: 1 }, { slot: 7 }] })).toEqual([1]);
  });

  it("selects one JSON path per possible task, never the snapshot itself", () => {
    expect(SNAPSHOT_SLOT_PATHS).toBe([
      "slot_1:snapshot->tasks->0->slot", "slot_2:snapshot->tasks->1->slot", "slot_3:snapshot->tasks->2->slot",
      "slot_4:snapshot->tasks->3->slot", "slot_5:snapshot->tasks->4->slot", "slot_6:snapshot->tasks->5->slot",
    ].join(","));
    expect(SNAPSHOT_SLOT_PATHS).not.toMatch(/diff/);
  });

  it("the paths helper with more than two", () => {
    expect(slotsFromSnapshotPaths(1, 3, 4, null, null, null)).toEqual([1, 3, 4]);
    expect(slotsFromSnapshotPaths(1, 2, 3, 4, 5, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(slotsFromSnapshotPaths(...snapshotSlotPathValues({ slot_1: 2, slot_2: 5, slot_3: null }))).toEqual([2, 5]);
    // Two arguments, as before.
    expect(slotsFromSnapshotPaths(1, null)).toEqual([1]);
    expect(slotsFromSnapshotPaths(null, null)).toEqual([1, 2]);
  });
});

function grade(slot: number, overrides: Partial<TaskGradeRow> = {}): TaskGradeRow {
  return {
    task_slot: slot,
    rubric: RUBRIC.map((row): CriterionGrade => ({ name: row.name, points: row.points, level: "full", awarded: row.points, rationale: "", evidenceQuotes: [], needsReview: false, source: "llm" })),
    agent_total: 10, needs_review: false, model: "m", prompt_version: "v", graded_at: "2026-11-20T00:00:00Z",
    instructor_rubric: null, instructor_total: null, instructor_notes: null, released_at: null, ...overrides,
  };
}

describe("release blockers with more tasks (#412)", () => {
  it("four tasks, one ungraded, blocks with that task named", () => {
    expect(releaseBlockers([grade(1), grade(2), grade(4)], [1, 2, 3, 4])).toEqual(["Task 3 has no grade yet."]);
    expect(releaseBlockers([grade(1), grade(2), grade(3), grade(4)], [1, 2, 3, 4])).toEqual([]);
  });

  it("a gap: only the submitted slots need a grade", () => {
    expect(releaseBlockers([grade(1), grade(3)], [1, 3])).toEqual([]);
  });
});

// ---- Submit rules ----

describe("submitTasksError with more tasks (#412)", () => {
  const task = (slot: number, overrides: Partial<{ task_id: string; pr_url: string; task_path: string; analysis_result_id: string | null }> = {}) => ({
    task_slot: slot, task_id: `EX-2-T-${slot}`, pr_url: `https://github.com/example/app/pull/${slot}`,
    task_path: `docs/tasks/sprint-2/EX-2-T-${slot}.md`, analysis_result_id: `r${slot}`, ...overrides,
  });

  it("accepts three valid tasks, six, and a gap", () => {
    expect(submitTasksError([task(1), task(2), task(3)])).toBeNull();
    expect(submitTasksError(TASK_SLOTS.map((slot) => task(slot)))).toBeNull();
    expect(submitTasksError([task(1), task(3)])).toBeNull();
  });

  it("refuses seven", () => {
    const seven = [...TASK_SLOTS.map((slot) => task(slot)), task(7)];
    expect(submitTasksError(seven)).toBe("A sprint can have at most 6 tasks, and this one has 7. Remove a task, then submit.");
  });

  it("refuses a duplicate task ID among four, naming the two tasks", () => {
    expect(submitTasksError([task(1), task(2), task(3), task(4, { task_id: "EX-2-T-2" })]))
      .toBe("Task 2 and Task 4 have the same task ID, EX-2-T-2. Each task needs its own task ID.");
  });

  it("refuses the same task file from the same PR among three, naming the two tasks", () => {
    expect(submitTasksError([task(1), task(2), task(3, { pr_url: task(1).pr_url, task_path: task(1).task_path, task_id: "EX-2-T-9" })]))
      .toBe("Task 1 and Task 3 use the same task file from the same PR. Each task needs its own task file.");
  });

  it("refuses one unanalyzed task among five, naming it", () => {
    expect(submitTasksError([task(1), task(2), task(3), task(4, { analysis_result_id: null }), task(5)]))
      .toBe("Task 4 (EX-2-T-4) has not been analyzed yet. Re-check it, then submit.");
  });

  it("keeps two tasks from one PR, and refuses a third from it", () => {
    const shared = task(1).pr_url;
    expect(submitTasksError([task(1), task(2, { pr_url: shared }), task(3)])).toBeNull();
    expect(submitTasksError([task(1), task(2, { pr_url: shared }), task(3, { pr_url: shared })]))
      .toBe("Task 1, Task 2 and Task 3 come from the same PR. At most 2 of your tasks can come from one PR, each with its own task file.");
  });

  it("keeps the two-task messages as they were", () => {
    expect(submitTasksError([task(1), task(2, { task_id: "EX-2-T-1" })])).toBe("Your two tasks must have different task IDs.");
    expect(submitTasksError([task(1), task(3, { task_id: "EX-2-T-1" })])).toBe("Your two tasks must have different task IDs.");
  });
});

describe("one PR, several tasks: still at most two (#412)", () => {
  const own = (slot: number, taskPath: string): OwnTask => ({ assignment_number: 2, task_slot: slot, repo_full_name: "example/app", pr_number: 12, task_path: taskPath });
  const target = { assignmentNumber: 2, repoFullName: "example/app", prNumber: 12 };

  it("refuses a third task from one PR in slot 3, and says the limit", () => {
    expect(ownTaskConflict([own(1, "a.md"), own(2, "b.md")], { ...target, slot: 3, taskPath: "c.md" }))
      .toBe("At most two of your tasks can come from one PR, each with its own task file.");
    expect(ownTaskConflict([own(1, "a.md")], { ...target, slot: 3, taskPath: "c.md" })).toBeNull();
  });
});

describe("the grader's other-task note with more tasks (#412)", () => {
  type T = { slot: number; taskId: string; prUrl: string; taskPath: string; prTaskFiles?: string[] };
  const shared = "https://github.com/example/app/pull/12";
  const one: T = { slot: 1, taskId: "EX-2-T-1", prUrl: shared, taskPath: "docs/tasks/sprint-2/EX-2-T-1.md" };
  const three: T = { slot: 3, taskId: "EX-2-T-3", prUrl: shared, taskPath: "docs/tasks/sprint-2/EX-2-T-3.md" };
  const two: T = { slot: 2, taskId: "EX-2-T-2", prUrl: "https://github.com/example/app/pull/13", taskPath: "docs/tasks/sprint-2/EX-2-T-2.md" };
  const four: T = { slot: 4, taskId: "EX-2-T-4", prUrl: "https://github.com/example/app/pull/14", taskPath: "docs/tasks/sprint-2/EX-2-T-4.md" };
  const tasks = [one, two, three, four];

  it("names only the task from the same PR, whatever slots the others are in", () => {
    expect(prTaskFileGraderNotes(tasks, one)).toEqual([sharedPrGraderNote("EX-2-T-3")]);
    expect(prTaskFileGraderNotes(tasks, three)).toEqual([sharedPrGraderNote("EX-2-T-1")]);
    expect(prTaskFileGraderNotes(tasks, two)).toEqual([]);
    expect(prHoldsMoreThanThisTask(tasks, four)).toBe(false);
    expect(prTaskFileLines(tasks, three, "staff")).toEqual(["This PR holds two tasks: EX-2-T-1 (Task 1) and EX-2-T-3 (Task 3). They share one diff."]);
  });

  it("would name every other task if rows ever held three from one PR", () => {
    const five: T = { slot: 5, taskId: "EX-2-T-5", prUrl: shared, taskPath: "docs/tasks/sprint-2/EX-2-T-5.md" };
    expect(prTaskFileGraderNotes([one, three, five], one)).toEqual([
      "This PR holds 3 tasks. The other tasks, EX-2-T-3 and EX-2-T-5, each have their own task file and grade; judge this task only against its own task file and acceptance criteria, and do not count the other tasks' work for or against it.",
    ]);
    expect(prTaskFileLines([one, three, five], three, "student"))
      .toEqual(["This PR holds 3 tasks: EX-2-T-1 (Task 1), EX-2-T-3 (Task 3) and EX-2-T-5 (Task 5). They share one diff."]);
  });
});

// ---- Student page ----

describe("student page slots (#412)", () => {
  it("shows Task 1 and Task 2 as today, and offers Add another task", () => {
    const slots = shownTaskSlots([], [], false);
    expect(slots).toEqual([1, 2]);
    expect(canAddTask(slots, false)).toBe(true);
    expect(nextTaskSlot(slots)).toBe(3);
  });

  it("opens the next slot each time, up to six", () => {
    let opened: number[] = [];
    for (const expected of [3, 4, 5, 6]) {
      const next = nextTaskSlot(shownTaskSlots([1, 2], opened, false));
      expect(next).toBe(expected);
      opened = [...opened, next!];
    }
    const full = shownTaskSlots([1, 2], opened, false);
    expect(full).toEqual([1, 2, 3, 4, 5, 6]);
    expect(canAddTask(full, false)).toBe(false);
  });

  it("keeps a gap: Task 2 removed, Task 3 kept", () => {
    expect(shownTaskSlots([1, 3], [], false)).toEqual([1, 2, 3]);
    expect(nextTaskSlot([1, 2, 3])).toBe(4);
  });

  it("once submitted: no Add another task, opened empty slots go, submitted ones stay", () => {
    expect(shownTaskSlots([1, 2, 4], [3, 5], true)).toEqual([1, 2, 4]);
    expect(canAddTask([1, 2, 4], true)).toBe(false);
  });

  it("the warning text, word for word", () => {
    expect(EXTRA_TASK_WARNING).toBe("Every task you submit is graded, and your sprint score is the average of all of them. An extra task can raise your score or lower it.");
  });

  it("released grade wording for 1, 2 and N tasks", () => {
    expect(releasedScoreBasis(1)).toBe("your one big task");
    expect(releasedScoreBasis(2)).toBe("the average of your two tasks");
    expect(releasedScoreBasis(3)).toBe("the average of all 3 of your tasks");
    expect(releasedScoreBasis(6)).toBe("the average of all 6 of your tasks");
  });

  it("submit dialog and bar for more tasks; two tasks unchanged", () => {
    expect(manyTasksConfirmText(2)).toBe("Both tasks lock when you submit. You can still change your submission until the sprint closes.");
    expect(manyTasksConfirmText(4)).toBe("All 4 tasks lock when you submit. You can still change your submission until the sprint closes.");
    expect(submitBarText(0, 0)).toBe("0 of 2 ready · You can change your submission until the sprint closes.");
    expect(submitBarText(2, 1)).toBe("1 of 2 ready · You can change your submission until the sprint closes.");
    expect(submitBarText(3, 2)).toBe("2 of 3 ready · You can change your submission until the sprint closes.");
    expect(submitAction(2, 2, 2).label).toBe("Submit Sprint 2");
    expect(submitAction(3, 2, 2).label).toBe("Submit Sprint 2 anyway");
    expect(submitAction(3, 3, 2).label).toBe("Submit Sprint 2");
  });
});

// ---- Staff ----

describe("staff review line (#412)", () => {
  it("adds a line for three or more tasks; one task keeps its line", () => {
    expect(manyTasksReviewLine(1)).toBeNull();
    expect(manyTasksReviewLine(2)).toBeNull();
    expect(manyTasksReviewLine(3)).toBe("3 tasks: the sprint score is the average of all 3.");
    expect(manyTasksReviewLine(6)).toBe("6 tasks: the sprint score is the average of all 6.");
    expect(oneTaskReviewLine(4).text).toBe("One-task sprint: this task is the sprint score. Estimate: 4 hours.");
  });
});

function row(email: string, totals: Record<number, number> | null, sprint: number | null = null): SubmissionRow {
  if (!totals) return { userId: email, email, submission: null };
  return {
    userId: email, email,
    submission: {
      id: `s-${email}`, attempt: 1, status: "graded", submittedAt: "2026-11-20T10:00:00Z",
      tasks: Object.entries(totals).map(([slot, total]) => ({ slot: Number(slot), agentTotal: total, instructorTotal: null, needsReview: false })),
      agentSprint: sprint, sprint, needsReview: false, jobError: null,
    },
  };
}

describe("instructor table columns and sorting (#412)", () => {
  it("shows Task 1 and Task 2 only, when no listed submission has more", () => {
    expect(taskColumnSlots([row("student-a@ucsc.edu", { 1: 8, 2: 6 }), row("student-b@ucsc.edu", null)])).toEqual([1, 2]);
    expect(taskColumnSlots([])).toEqual([1, 2]);
  });

  it("adds a column only for each further slot a listed submission has", () => {
    const rows = [row("student-a@ucsc.edu", { 1: 8, 2: 6 }), row("student-b@ucsc.edu", { 1: 9, 2: 7, 4: 5 })];
    expect(taskColumnSlots(rows)).toEqual([1, 2, 4]);
  });

  it("sorts by Task 3 like the other task columns, rows without it last", () => {
    const rows = [
      row("student-a@ucsc.edu", { 1: 8, 2: 6 }),
      row("student-b@ucsc.edu", { 1: 9, 2: 7, 3: 5 }),
      row("student-c@ucsc.edu", null),
      row("student-d@ucsc.edu", { 1: 6, 2: 6, 3: 9 }),
    ];
    const names = (list: SubmissionRow[]) => list.map((item) => item.email.split("@")[0]);
    expect(nextSort(null, "task3")).toEqual({ key: "task3", direction: "desc" });
    expect(names(sortRows(rows, { key: "task3", direction: "desc" }))).toEqual(["student-d", "student-b", "student-a", "student-c"]);
    expect(names(sortRows(rows, { key: "task3", direction: "asc" }))).toEqual(["student-b", "student-d", "student-a", "student-c"]);
    expect(SORT_KEYS).toEqual(["student", "team", "submitted", "status", "task1", "task2", "task3", "task4", "task5", "task6", "sprint"]);
  });
});

// ---- Routes ----

const routeState = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  results: {} as Record<string, unknown>,
}));

/** A Supabase query that records each call and resolves to the table's result, however it is awaited. */
function fakeQuery(table: string): unknown {
  const query: unknown = new Proxy(function noop() {}, {
    get(_target, key) {
      const result = routeState.results[table] ?? { data: null, error: null };
      if (key === "then") return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      if (key === "single" || key === "maybeSingle") return () => Promise.resolve(result);
      return (...args: unknown[]) => { routeState.calls.push({ table, op: String(key), args }); return query; };
    },
  });
  return query;
}

vi.mock("@/lib/supabase/server", () => ({ isSupabaseConfigured: () => true, getSupabase: () => ({ from: (table: string) => fakeQuery(table) }) }));
vi.mock("@/lib/cse115a/server", () => ({
  getCourseIdentity: async () => ({ userId: "user-1", email: "student-a@ucsc.edu", githubLogin: "student-a" }),
  getEnrolledCourse: async () => ({ id: "course-1", slug: "CSE115A-EX", assignment_count: 5 }),
  getActiveAssignmentSubmission: async () => null,
  lockedAssignmentMessage: (n: number) => `Sprint ${n} is submitted.`,
  TASK_SUBMISSION_COLUMNS: "*",
}));
vi.mock("@/lib/cse115a/instructorApi", () => ({
  guardSubmission: async () => ({ identity: { userId: "staff-1" } }),
  guardCourse: async () => ({ identity: { userId: "staff-1" }, course: { id: "course-1", slug: "CSE115A-EX", assignment_count: 5 } }),
}));

beforeEach(() => {
  routeState.calls = [];
  routeState.results = {};
});

function json(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("routes take slots 1 to 6 (#412)", () => {
  it("removes a task in slot 3 or 6, and refuses slot 7 and slot 0", async () => {
    const { DELETE } = await import("../app/api/cse115a/assignments/[number]/tasks/route");
    const params = { params: Promise.resolve({ number: "2" }) };
    const remove = async (slot: number) => (await DELETE(json({ courseSlug: "CSE115A-EX", slot }, "DELETE"), params))!;
    for (const slot of [3, 6]) {
      const response = await remove(slot);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ removed: { slot } });
      expect(routeState.calls).toContainEqual({ table: "cse_task_submissions", op: "eq", args: ["task_slot", slot] });
    }
    for (const slot of [7, 0]) {
      routeState.calls = [];
      const response = await remove(slot);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: TASK_SLOT_ERROR });
      expect(routeState.calls).toEqual([]);
    }
  });

  it("removing a task after submit answers as locked", async () => {
    const { DELETE } = await import("../app/api/cse115a/assignments/[number]/tasks/route");
    routeState.results.cse_task_submissions = { data: null, error: { message: "assignment_locked" } };
    const response = await DELETE(json({ courseSlug: "CSE115A-EX", slot: 3 }, "DELETE"), { params: Promise.resolve({ number: "2" }) });
    expect(response!.status).toBe(409);
  });

  it("saves the Scrum board box for slot 3 and slot 6, and refuses slot 7 and slot 0", async () => {
    const { PATCH } = await import("../app/api/cse115a/assignments/[number]/tasks/route");
    const params = { params: Promise.resolve({ number: "2" }) };
    routeState.results.cse_task_submissions = { data: { id: "t" }, error: null };
    for (const slot of [3, 6]) expect((await PATCH(json({ courseSlug: "CSE115A-EX", slot, scrumBoard: true }, "PATCH"), params))!.status).toBe(200);
    for (const slot of [7, 0]) expect((await PATCH(json({ courseSlug: "CSE115A-EX", slot, scrumBoard: true }, "PATCH"), params))!.status).toBe(400);
  });

  it("saves instructor points for slot 3 and slot 6, and refuses slot 7 and slot 0", async () => {
    const { PUT } = await import("../app/api/cse115a/instructor/submissions/[id]/grade/route");
    const rubric = RUBRIC.map((item) => ({ name: item.name, awarded: item.points, note: "" }));
    const params = { params: Promise.resolve({ id: "sub-1" }) };
    routeState.results.cse_task_grades = { data: { task_slot: 3 }, error: null };
    for (const slot of [3, 6]) expect((await PUT(json({ slot, rubric, notes: "" }, "PUT"), params)).status).toBe(200);
    for (const slot of [7, 0]) {
      const response = await PUT(json({ slot, rubric, notes: "" }, "PUT"), params);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "slot must be a whole number from 1 to 6." });
    }
  });

  it("reads a task's commits for slot 3 and slot 6, and refuses slot 7 and slot 0", async () => {
    const { GET } = await import("../app/api/cse115a/assignments/[number]/tasks/[slot]/commits/route");
    const get = (slot: string) => GET(new Request("http://localhost/x"), { params: Promise.resolve({ number: "2", slot }) });
    // Past the slot check, the fake has no task row, so the route answers "Task not found."
    for (const slot of ["3", "6"]) expect((await get(slot)).status).toBe(404);
    for (const slot of ["7", "0"]) expect((await get(slot)).status).toBe(400);
  });

  it("the instructor list scores every submitted task and lists only extra slots that were submitted", async () => {
    const { GET } = await import("../app/api/cse115a/instructor/courses/[slug]/submissions/route");
    routeState.results = {
      cse_course_memberships: { data: [{ user_id: "u1", ucsc_email: "student-a@ucsc.edu" }, { user_id: "u2", ucsc_email: "student-b@ucsc.edu" }], error: null },
      cse_assignment_submissions: { data: [
        { id: "s1", user_id: "u1", attempt: 1, status: "graded", submitted_at: "2026-11-20T00:00:00Z", slot_1: 1, slot_2: 3, slot_3: 4, slot_4: null, slot_5: null, slot_6: null },
        { id: "s2", user_id: "u2", attempt: 1, status: "graded", submitted_at: "2026-11-20T00:00:00Z", slot_1: 1, slot_2: 2, slot_3: null, slot_4: null, slot_5: null, slot_6: null },
      ], error: null },
      cse_task_grades: { data: [
        { assignment_submission_id: "s1", task_slot: 1, agent_total: 10, instructor_total: null, needs_review: false, released_at: null },
        { assignment_submission_id: "s1", task_slot: 3, agent_total: 10, instructor_total: null, needs_review: false, released_at: null },
        { assignment_submission_id: "s1", task_slot: 4, agent_total: 9, instructor_total: 6, needs_review: false, released_at: null },
        { assignment_submission_id: "s2", task_slot: 1, agent_total: 8, instructor_total: null, needs_review: false, released_at: null },
        { assignment_submission_id: "s2", task_slot: 2, agent_total: 6, instructor_total: null, needs_review: false, released_at: null },
      ], error: null },
      cse_grading_jobs: { data: [], error: null },
    };
    const response = await GET(new Request("http://localhost/x?assignment=2"), { params: Promise.resolve({ slug: "CSE115A-EX" }) });
    const body = await response.json() as { rows: SubmissionRow[] };
    const [a, b] = body.rows;
    expect(a!.submission!.tasks.map((task) => task.slot)).toEqual([1, 2, 3, 4]);
    expect(Number(a!.submission!.sprint!.toFixed(2))).toBe(8.67);
    expect(a!.submission!.agentSprint).toBeCloseTo(29 / 3);
    expect(b!.submission!.tasks.map((task) => task.slot)).toEqual([1, 2]);
    expect(b!.submission!.sprint).toBe(7);
    expect(taskColumnSlots(body.rows)).toEqual([1, 2, 3, 4]);
    const select = routeState.calls.find((call) => call.table === "cse_assignment_submissions" && call.op === "select");
    // #440 adds each task's repository (the team) as a JSON path, still never the diff.
    expect(select?.args[0]).toBe(`id,user_id,attempt,status,submitted_at,${SNAPSHOT_SLOT_PATHS},${SNAPSHOT_REPO_PATHS}`);
  });
});

// ---- Migration ----

describe("20261120010000_cse115a_extra_tasks.sql (#412)", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20261120010000_cse115a_extra_tasks.sql"), "utf8");
  const code = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");

  it("widens the three slot checks, by their names, to between 1 and the constant", () => {
    for (const table of ["cse_task_submissions", "cse_task_grades", "cse_benchmark_task_sources"]) {
      expect(code).toContain(`alter table public.${table} drop constraint ${table}_task_slot_check;`);
      expect(code).toContain(`add constraint ${table}_task_slot_check check (task_slot between 1 and ${MAX_TASKS_PER_SPRINT});`);
    }
    expect(code).not.toMatch(/in \(1, 2\)/);
  });

  it("submit_cse_assignment accepts 6 tasks and refuses 7", () => {
    const bounds = code.match(/if n not between (\d+) and (\d+) or matching <> n or stored <> n then/);
    expect(bounds).not.toBeNull();
    const [low, high] = [Number(bounds![1]), Number(bounds![2])];
    const refused = (n: number) => n < low || n > high;
    expect([1, 2, 6].map(refused)).toEqual([false, false, false]);
    expect([0, 7].map(refused)).toEqual([true, true]);
    expect(high).toBe(MAX_TASKS_PER_SPRINT);
  });

  it("keeps submit_cse_assignment's signature and grants", () => {
    expect(code).toContain("create or replace function public.submit_cse_assignment(\n  p_course_id uuid,\n  p_user_id uuid,\n  p_assignment_number integer,\n  p_snapshot jsonb\n)");
    expect(code).toContain("revoke all on function public.submit_cse_assignment(uuid, uuid, integer, jsonb) from public, anon, authenticated;");
    expect(code).toContain("grant execute on function public.submit_cse_assignment(uuid, uuid, integer, jsonb) to service_role;");
  });

  it("carries the undo statements in its header", () => {
    for (const table of ["cse_task_submissions", "cse_task_grades", "cse_benchmark_task_sources"]) {
      expect(sql).toContain(`--   alter table public.${table} add constraint ${table}_task_slot_check check (task_slot in (1, 2));`);
    }
  });
});
