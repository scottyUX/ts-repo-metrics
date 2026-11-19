import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProcessChecklist } from "@/components/cse115a/ProcessChecklist";
import {
  BIG_TASK_MIN_HOURS,
  TASK_MIN_HOURS,
  bigTaskEstimateOk,
  estimateMeetsTaskMinimum,
  oneTaskConfirmText,
  oneTaskReviewLine,
  processChecklist,
  specEstimateHours,
  resolvePullRequestUrl,
  sprintReady,
  submitAction,
  submitBarText,
  submitTasksError,
  canChangeSubmission,
  linesToFix,
  NO_BASE_TAG_DETAIL,
  type TaskFacts,
} from "@/lib/cse115a/processChecklist";

const passing = {
  specCommittedFirst: true,
  baseTagPushed: true,
  doneTagOnMergeCommit: true,
  prAuthoredByStudent: true,
  prTitleHasTaskId: true,
  branchHasTaskId: true,
  estimateAtLeastTwoHours: true,
};

const facts: TaskFacts = {
  ci: { state: "none", failed: 0, total: 0 },
  testFileCount: 0,
  mergeSha: "9f3c2a1",
  firstCommitSha: "a1b2c3d",
  prNumber: 7,
};

describe("sprint checklist", () => {
  it("renders each process check with a fix or a new-PR explanation", () => {
    const cases: Array<{ key: keyof typeof passing; detail: string }> = [
      { key: "specCommittedFirst", detail: "use a new task" },
      { key: "baseTagPushed", detail: "git fetch origin pull/7/head && git tag US-4-T-2-base a1b2c3d && git push origin US-4-T-2-base" },
      { key: "doneTagOnMergeCommit", detail: "git fetch origin && git tag US-4-T-2-done 9f3c2a1 && git push origin US-4-T-2-done" },
      { key: "prAuthoredByStudent", detail: "Can't be fixed on this PR." },
      { key: "prTitleHasTaskId", detail: "Edit the PR title on GitHub, then Re-check." },
      { key: "branchHasTaskId", detail: "Can't be fixed on this PR." },
      { key: "estimateAtLeastTwoHours", detail: "merged task file" },
    ];
    for (const item of cases) {
      const validation = { ...passing, [item.key]: false };
      const html = renderToStaticMarkup(createElement(ProcessChecklist, { validation, facts, taskId: "US-4-T-2" }));
      const line = processChecklist(validation, facts, "US-4-T-2").find((entry) => !entry.ok);
      expect(line?.detail).toContain(item.detail);
      expect(html).toContain("✗");
      expect(html).toContain(item.detail.replaceAll("&", "&amp;").replaceAll("'", "&#x27;"));
    }
  });

  it("treats Ready as the six process checks only", () => {
    expect(sprintReady(passing)).toBe(true);
    expect(sprintReady({ ...passing, baseTagPushed: false })).toBe(false);
    const html = renderToStaticMarkup(createElement(ProcessChecklist, {
      validation: passing,
      facts: { ...facts, testFileCount: 0, ci: { state: "failed", failed: 2, total: 3 } },
      taskId: "US-4-T-2",
    }));
    expect(sprintReady(passing)).toBe(true);
    expect(html).toContain("GitHub Actions: 2 of 3 failed");
    expect(html).toContain("No test files in this PR");
    expect(html).not.toContain("✗");
  });

  describe("base-tag line when the first commit isn't the task file alone", () => {
    // A code-first PR: the spec-first check fails and no base tag was pushed.
    const codeFirst = { ...passing, specCommittedFirst: false, baseTagPushed: false };
    const baseLine = (validation: Record<string, boolean>, lineFacts: Partial<TaskFacts>) =>
      processChecklist(validation, lineFacts, "US-4-T-2").find((entry) => entry.key === "baseTagPushed")!;

    it("shows the don't-tag detail with no command and leaves the line out of N to fix", () => {
      expect(NO_BASE_TAG_DETAIL).toBe("Don't add this tag: your first commit isn't the task file, so tagging it would leave that commit's code out of your graded work.");
      const codeFacts = { ...facts, firstCommitTaskOnly: false };
      const line = baseLine(codeFirst, codeFacts);
      expect(line).toMatchObject({ ok: false, detail: NO_BASE_TAG_DETAIL, counts: false });
      expect(line.detail).not.toContain("git ");
      const lines = processChecklist(codeFirst, codeFacts, "US-4-T-2");
      expect(linesToFix(lines).map((entry) => entry.key)).toEqual(["specCommittedFirst"]);
      const html = renderToStaticMarkup(createElement(ProcessChecklist, { validation: codeFirst, facts: codeFacts, taskId: "US-4-T-2" }));
      expect(html).not.toContain("git tag US-4-T-2-base");
      expect(html).toContain("Don&#x27;t add this tag");
    });

    it("keeps today's command for a task-file-first PR with no tag, and when the first commit is unknown", () => {
      const noTag = { ...passing, baseTagPushed: false };
      const command = "git fetch origin pull/7/head && git tag US-4-T-2-base a1b2c3d && git push origin US-4-T-2-base";
      for (const firstCommitTaskOnly of [true, null, undefined]) {
        const lineFacts = { ...facts, firstCommitTaskOnly };
        const line = baseLine(noTag, lineFacts);
        expect(line).toEqual({ key: "baseTagPushed", ok: false, label: "US-4-T-2-base tag pushed", detail: command });
        expect(linesToFix(processChecklist(noTag, lineFacts, "US-4-T-2")).map((entry) => entry.key)).toEqual(["baseTagPushed"]);
        expect(baseLine(codeFirst, lineFacts).detail).toBe(command);
      }
    });

    it("shows the don't-tag detail for a paired task", () => {
      const pairedFacts = { ...facts, firstCommitTaskOnly: null, taskFilePr: { url: "https://github.com/team/proj/pull/8", number: 8, mergeSha: "c0ffee1" } };
      expect(baseLine(codeFirst, pairedFacts)).toMatchObject({ ok: false, detail: NO_BASE_TAG_DETAIL, counts: false });
      expect(baseLine(codeFirst, { ...pairedFacts, firstCommitTaskOnly: false }).detail).toBe(NO_BASE_TAG_DETAIL);
    });

    it("leaves a pushed tag's line and sprintReady as they were", () => {
      const tagged = { ...codeFirst, baseTagPushed: true };
      expect(baseLine(tagged, { ...facts, firstCommitTaskOnly: false })).toEqual({ key: "baseTagPushed", ok: true, label: "US-4-T-2-base tag pushed", detail: null });
      expect(sprintReady(codeFirst)).toBe(false);
      expect(sprintReady(tagged)).toBe(false);
    });
  });

  it("offers Submit anyway only after both PRs are added", () => {
    expect(submitAction(2, 1, 2)).toEqual({ disabled: false, label: "Submit Sprint 2 anyway", reason: null });
    expect(submitAction(2, 2, 2).label).toBe("Submit Sprint 2");
  });

  it("allows submitting one task, not zero (#348)", () => {
    expect(submitAction(0, 0, 2)).toEqual({ disabled: true, label: "Submit Sprint 2", reason: "Add a task to submit." });
    expect(submitAction(1, 1, 2)).toEqual({ disabled: false, label: "Submit Sprint 2 with one task", reason: null });
    expect(submitAction(1, 0, 3)).toEqual({ disabled: false, label: "Submit Sprint 3 with one task", reason: null });
  });

  it("says one big task counts as the whole sprint at 4 hours or more (#348)", () => {
    expect(submitBarText(1, 1, 4)).toBe("1 task added · one big task counts as the whole sprint");
    expect(submitBarText(1, 0, 6.5)).toBe("1 task added · one big task counts as the whole sprint");
  });

  it("warns, without blocking, when one task's estimate is under 4 hours or missing (#348)", () => {
    expect(submitBarText(1, 1, 3)).toBe("1 task added · one big task needs an estimate of 4 hours or more (this one says 3). Add a second task, or submit anyway and a grader will check its size.");
    expect(submitBarText(1, 1, 3.5)).toBe("1 task added · one big task needs an estimate of 4 hours or more (this one says 3.5). Add a second task, or submit anyway and a grader will check its size.");
    expect(submitBarText(1, 1, null)).toBe("1 task added · one big task needs an estimate of 4 hours or more (this one has no estimate). Add a second task, or submit anyway and a grader will check its size.");
    expect(submitBarText(1, 1)).toBe("1 task added · one big task needs an estimate of 4 hours or more (this one has no estimate). Add a second task, or submit anyway and a grader will check its size.");
    expect(submitAction(1, 1, 2)).toEqual({ disabled: false, label: "Submit Sprint 2 with one task", reason: null });
  });

  it("leaves two tasks as they were, whatever the estimates", () => {
    expect(submitBarText(0, 0)).toBe("0 of 2 ready · You can change your submission until the sprint closes.");
    expect(submitBarText(2, 1)).toBe("1 of 2 ready · You can change your submission until the sprint closes.");
    expect(submitBarText(2, 2, 3)).toBe("2 of 2 ready · You can change your submission until the sprint closes.");
    expect(sprintReady({ ...passing, estimateAtLeastTwoHours: true })).toBe(true);
  });

  it("asks to confirm one big task, adding the size warning under 4 hours (#348)", () => {
    const base = "You are submitting one big task. It counts as the whole sprint, scored out of 10. You can still change your submission and add a second task until the sprint closes.";
    expect(oneTaskConfirmText(4)).toBe(base);
    expect(oneTaskConfirmText(3)).toBe(`${base} Its estimate is 3 hours; one big task needs 4 or more. A grader will check its size.`);
    expect(oneTaskConfirmText(1)).toBe(`${base} Its estimate is 1 hour; one big task needs 4 or more. A grader will check its size.`);
    expect(oneTaskConfirmText(null)).toBe(`${base} It has no estimate; one big task needs 4 or more. A grader will check its size.`);
  });

  it("shows staff the one-task line, amber under 4 hours (#348)", () => {
    expect(oneTaskReviewLine(5)).toEqual({ text: "One-task sprint: this task is the sprint score. Estimate: 5 hours.", warn: false });
    expect(oneTaskReviewLine(4)).toEqual({ text: "One-task sprint: this task is the sprint score. Estimate: 4 hours.", warn: false });
    expect(oneTaskReviewLine(3)).toEqual({ text: "One-task sprint: this task is the sprint score. Estimate: 3 hours (one big task needs 4 or more).", warn: true });
    expect(oneTaskReviewLine(null)).toEqual({ text: "One-task sprint: this task is the sprint score. Estimate: none (one big task needs 4 or more).", warn: true });
  });

  it("reads the estimate from a saved task spec", () => {
    expect(specEstimateHours({ estimateHours: 4 })).toBe(4);
    expect(specEstimateHours({ estimateHours: Number.NaN })).toBeNull();
    expect(specEstimateHours({})).toBeNull();
    expect(specEstimateHours(null)).toBeNull();
  });

  it("keeps the hours in one place: a big task is twice the regular minimum", () => {
    expect(TASK_MIN_HOURS).toBe(2);
    expect(BIG_TASK_MIN_HOURS).toBe(4);
    expect([3.99, 4, 4.5, null, undefined].map(bigTaskEstimateOk)).toEqual([false, true, true, false, false]);
  });

  it("gives estimateAtLeastTwoHours the same answers as hours >= 2", () => {
    for (const hours of [0, 1, 1.5, 1.99, 2, 2.5, 3, 4, 8, Number.NaN, -1]) {
      expect(estimateMeetsTaskMinimum(hours)).toBe(hours >= 2);
    }
  });

  it("re-checks the saved URL when the input is empty", () => {
    const saved = "https://github.com/team/repo/pull/12";
    expect(resolvePullRequestUrl("", saved, "recheck")).toBe(saved);
    expect(resolvePullRequestUrl("", saved, "add")).toBe("");
  });

  it("shows missing CI as optional, without a failure mark", () => {
    const html = renderToStaticMarkup(createElement(ProcessChecklist, {
      validation: { ...passing, doneTagOnMergeCommit: false },
      facts,
      taskId: "US-4-T-2",
    }));
    expect(html).toContain('data-fact="ci">No CI found (optional)');
    expect(html).not.toMatch(/✗[^<]*No CI found/);
  });
});

describe("canChangeSubmission", () => {
  const due = "2026-12-31T23:59:59-08:00";
  it("allows changes before the deadline", () => {
    expect(canChangeSubmission("submitted", due, new Date("2026-10-01T12:00:00Z"))).toBe(true);
    expect(canChangeSubmission("graded", due, new Date("2026-10-01T12:00:00Z"))).toBe(true);
  });
  it("blocks changes after the deadline", () => {
    expect(canChangeSubmission("submitted", due, new Date("2027-01-01T08:00:00Z"))).toBe(false);
  });
  it("blocks changes once a grade is released, even before the deadline", () => {
    expect(canChangeSubmission("released", due, new Date("2026-10-01T12:00:00Z"))).toBe(false);
  });
  it("keeps a sprint without a deadline open", () => {
    expect(canChangeSubmission("submitted", null)).toBe(true);
  });
});

describe("submitTasksError (#348)", () => {
  const task = (slot: number, overrides: Partial<{ task_id: string; pr_url: string; task_path: string; analysis_result_id: string | null }> = {}) => ({
    task_slot: slot, task_id: `US-1-T-${slot}`, pr_url: `https://github.com/team/repo/pull/${slot}`,
    task_path: `docs/tasks/sprint-1/US-1-T-${slot}.md`, analysis_result_id: `r${slot}`, ...overrides,
  });

  it("accepts one or two analyzed tasks", () => {
    expect(submitTasksError([task(1)])).toBeNull();
    expect(submitTasksError([task(2)])).toBeNull();
    expect(submitTasksError([task(1), task(2)])).toBeNull();
  });

  it("refuses nothing to submit", () => {
    expect(submitTasksError([])).toBe("Add and analyze at least one merged task PR first.");
  });

  it("refuses a task that is added but not analyzed, and says which", () => {
    expect(submitTasksError([task(1, { analysis_result_id: null })])).toBe("Task 1 (US-1-T-1) has not been analyzed yet. Re-check it, then submit.");
    expect(submitTasksError([task(1), task(2, { analysis_result_id: null })])).toBe("Task 2 (US-1-T-2) has not been analyzed yet. Re-check it, then submit.");
  });

  it("refuses two tasks with the same task ID", () => {
    expect(submitTasksError([task(1), task(2, { task_id: "US-1-T-1" })])).toBe("Your two tasks must have different task IDs.");
  });

  it("accepts the same PR in both slots with two different task files (one merged PR, two tasks)", () => {
    expect(submitTasksError([task(1), task(2, { pr_url: task(1).pr_url })])).toBeNull();
  });

  it("refuses the same PR in both slots with the same task file", () => {
    expect(submitTasksError([task(1), task(2, { pr_url: task(1).pr_url, task_path: task(1).task_path, task_id: "US-1-T-9" })]))
      .toBe("Your two tasks use the same task file from the same PR. Each task needs its own task file.");
  });

  it("leaves two different PRs as before", () => {
    expect(submitTasksError([task(1), task(2)])).toBeNull();
    expect(submitTasksError([task(1), task(2, { task_path: task(1).task_path })])).toBeNull();
  });
});
