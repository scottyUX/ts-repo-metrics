import { describe, expect, it } from "vitest";
import { nextSort, shownTaskTotal, sortRows, type SubmissionRow } from "@/components/cse115a/instructor/sortRows";

function row(email: string, submission: Partial<NonNullable<SubmissionRow["submission"]>> | null): SubmissionRow {
  if (!submission) return { userId: email, email, submission: null };
  return {
    userId: email,
    email,
    submission: {
      id: `s-${email}`, attempt: 1, status: "graded", submittedAt: "2026-11-10T10:00:00Z", tasks: [],
      agentSprint: null, sprint: null, needsReview: false, jobError: null, ...submission,
    },
  };
}

const tasks = (t1: number | null, t2: number | null, instructor1: number | null = null) => [
  ...(t1 === null ? [] : [{ slot: 1, agentTotal: t1, instructorTotal: instructor1, needsReview: false }]),
  ...(t2 === null ? [] : [{ slot: 2, agentTotal: t2, instructorTotal: null, needsReview: false }]),
];

const rows: SubmissionRow[] = [
  row("carol@ucsc.edu", { status: "released", submittedAt: "2026-11-12T10:00:00Z", tasks: tasks(6, 8), sprint: 7 }),
  row("alice@ucsc.edu", null),
  row("bob@ucsc.edu", { status: "graded", needsReview: true, submittedAt: "2026-11-11T10:00:00Z", tasks: tasks(9, null, 10), sprint: 10 }),
  row("dave@ucsc.edu", { status: "submitted", submittedAt: "2026-11-13T10:00:00Z", tasks: [], sprint: null }),
  row("erin@ucsc.edu", { status: "graded", submittedAt: "2026-11-09T10:00:00Z", tasks: tasks(5, 5), sprint: 5 }),
];
const emails = (list: SubmissionRow[]) => list.map((item) => item.email.split("@")[0]);

describe("instructor table sorting", () => {
  it("keeps the server's order with no sort", () => {
    expect(emails(sortRows(rows, null))).toEqual(["carol", "alice", "bob", "dave", "erin"]);
  });

  it("sorts by student, either way", () => {
    expect(emails(sortRows(rows, { key: "student", direction: "asc" }))).toEqual(["alice", "bob", "carol", "dave", "erin"]);
    expect(emails(sortRows(rows, { key: "student", direction: "desc" }))).toEqual(["erin", "dave", "carol", "bob", "alice"]);
  });

  it("sorts by status in the order work moves, needs review before plain ready for review", () => {
    expect(emails(sortRows(rows, { key: "status", direction: "asc" }))).toEqual(["alice", "dave", "bob", "erin", "carol"]);
  });

  it("sorts task and sprint scores by the shown total, and puts rows with no score last either way", () => {
    expect(emails(sortRows(rows, { key: "task1", direction: "desc" }))).toEqual(["bob", "carol", "erin", "alice", "dave"]);
    expect(emails(sortRows(rows, { key: "task1", direction: "asc" }))).toEqual(["erin", "carol", "bob", "alice", "dave"]);
    expect(emails(sortRows(rows, { key: "task2", direction: "desc" }))).toEqual(["carol", "erin", "alice", "bob", "dave"]);
    expect(emails(sortRows(rows, { key: "sprint", direction: "desc" }))).toEqual(["bob", "carol", "erin", "alice", "dave"]);
  });

  it("sorts by submitted time, newest first on the first click", () => {
    expect(nextSort(null, "submitted")).toEqual({ key: "submitted", direction: "desc" });
    expect(emails(sortRows(rows, { key: "submitted", direction: "desc" }))).toEqual(["dave", "carol", "bob", "erin", "alice"]);
  });

  it("uses the instructor's total over the agent's draft", () => {
    expect(shownTaskTotal(rows[2]!, 1)).toBe(10);
    expect(shownTaskTotal(rows[0]!, 1)).toBe(6);
    expect(shownTaskTotal(rows[1]!, 1)).toBeNull();
  });

  it("cycles a column: first direction, the other direction, then off", () => {
    expect(nextSort(null, "student")).toEqual({ key: "student", direction: "asc" });
    expect(nextSort({ key: "student", direction: "asc" }, "student")).toEqual({ key: "student", direction: "desc" });
    expect(nextSort({ key: "student", direction: "desc" }, "student")).toBeNull();
    expect(nextSort(null, "sprint")).toEqual({ key: "sprint", direction: "desc" });
    expect(nextSort({ key: "sprint", direction: "desc" }, "sprint")).toEqual({ key: "sprint", direction: "asc" });
    expect(nextSort({ key: "sprint", direction: "desc" }, "student")).toEqual({ key: "student", direction: "asc" });
  });

  it("keeps ties in the server's order", () => {
    const tied = [row("z@ucsc.edu", { sprint: 7 }), row("a@ucsc.edu", { sprint: 7 })];
    expect(emails(sortRows(tied, { key: "sprint", direction: "desc" }))).toEqual(["z", "a"]);
    expect(emails(sortRows(tied, { key: "sprint", direction: "asc" }))).toEqual(["z", "a"]);
  });
});
