import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProcessChecklist } from "@/components/cse115a/ProcessChecklist";
import {
  processChecklist,
  resolvePullRequestUrl,
  sprintReady,
  submitAction,
  canChangeSubmission,
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
};

describe("sprint checklist", () => {
  it("renders each process check with a fix or a new-PR explanation", () => {
    const cases: Array<{ key: keyof typeof passing; detail: string }> = [
      { key: "specCommittedFirst", detail: "use a new task" },
      { key: "baseTagPushed", detail: "git tag US-4-T-2-base a1b2c3d && git push origin US-4-T-2-base" },
      { key: "doneTagOnMergeCommit", detail: "git tag US-4-T-2-done 9f3c2a1 && git push origin US-4-T-2-done" },
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

  it("offers Submit anyway only after both PRs are added", () => {
    expect(submitAction(1, 1, 2)).toEqual({ disabled: true, label: "Submit Sprint 2", reason: "Add both tasks to submit." });
    expect(submitAction(2, 1, 2)).toEqual({ disabled: false, label: "Submit Sprint 2 anyway", reason: null });
    expect(submitAction(2, 2, 2).label).toBe("Submit Sprint 2");
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
