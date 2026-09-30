export type CiFact = { state: "none" | "passed" | "failed"; failed: number; total: number };

export type TaskFacts = {
  ci: CiFact;
  testFileCount: number | null;
  mergeSha: string;
  firstCommitSha: string | null;
};

export type ChecklistLine = {
  key: string;
  ok: boolean;
  label: string;
  detail: string | null;
};

type CheckLike = { source?: string; status: string; conclusion: string | null };

const PASSING = new Set(["success", "neutral", "skipped"]);

export function summarizeCi(checks: CheckLike[]): CiFact {
  const finished = checks.filter((check) => {
    if (check.source === "status") {
      return check.conclusion === "success" || check.conclusion === "failure" || check.conclusion === "error";
    }
    return check.status === "completed";
  });
  if (finished.length === 0) return { state: "none", failed: 0, total: 0 };
  const failed = finished.filter((check) => !PASSING.has(check.conclusion ?? "")).length;
  return { state: failed === 0 ? "passed" : "failed", failed, total: finished.length };
}

export function ciFactText(facts: Partial<TaskFacts> | null | undefined): string {
  const ci = facts?.ci;
  if (!ci || ci.state === "none" || ci.total === 0) return "No CI found (optional)";
  if (ci.state === "passed") return "GitHub Actions: passed";
  return `GitHub Actions: ${ci.failed} of ${ci.total} failed`;
}

export function testFactText(facts: Partial<TaskFacts> | null | undefined): string | null {
  if (typeof facts?.testFileCount !== "number") return null;
  if (facts.testFileCount === 0) return "No test files in this PR";
  return `Test files in this PR: ${facts.testFileCount}`;
}

export function sprintReady(validation: Record<string, boolean> | null | undefined): boolean {
  if (!validation) return false;
  return Boolean(
    validation.specCommittedFirst &&
    validation.baseTagPushed &&
    validation.doneTagOnMergeCommit &&
    validation.prAuthoredByStudent &&
    validation.prTitleHasTaskId &&
    validation.branchHasTaskId &&
    validation.estimateAtLeastTwoHours
  );
}

export function processChecklist(
  validation: Record<string, boolean>,
  facts: Partial<TaskFacts> | null | undefined,
  taskId: string,
): ChecklistLine[] {
  const id = taskId || "TASK";
  const merge = facts?.mergeSha ?? "";
  const first = facts?.firstCommitSha ?? "";
  const titleOk = Boolean(validation.prTitleHasTaskId);
  const branchOk = Boolean(validation.branchHasTaskId);
  const titleBranchDetail = !titleOk && !branchOk
    ? "Edit the PR title on GitHub, then Re-check. The branch name can't be fixed on this PR."
    : !titleOk
      ? "Edit the PR title on GitHub, then Re-check."
      : "Can't be fixed on this PR.";

  return [
    {
      key: "specCommittedFirst",
      ok: Boolean(validation.specCommittedFirst),
      label: "Task file committed alone, first",
      detail: validation.specCommittedFirst ? null : "Can't be fixed on this PR. The spec must come first; use a new task.",
    },
    {
      key: "baseTagPushed",
      ok: Boolean(validation.baseTagPushed),
      label: `${id}-base tag pushed`,
      detail: validation.baseTagPushed ? null : (first
        ? `git tag ${id}-base ${first} && git push origin ${id}-base`
        : "Push the base tag, then Re-check."),
    },
    {
      key: "doneTagOnMergeCommit",
      ok: Boolean(validation.doneTagOnMergeCommit),
      label: `${id}-done tag on the merge commit`,
      detail: validation.doneTagOnMergeCommit ? null : (merge
        ? `git tag ${id}-done ${merge} && git push origin ${id}-done`
        : "Push the done tag on the merge commit, then Re-check."),
    },
    {
      key: "prAuthoredByStudent",
      ok: Boolean(validation.prAuthoredByStudent),
      label: "Opened from your GitHub account",
      detail: validation.prAuthoredByStudent ? null : "Can't be fixed on this PR.",
    },
    {
      key: "taskIdInTitleAndBranch",
      ok: titleOk && branchOk,
      label: "Task ID in the PR title and branch",
      detail: titleOk && branchOk ? null : titleBranchDetail,
    },
    {
      key: "estimateAtLeastTwoHours",
      ok: Boolean(validation.estimateAtLeastTwoHours),
      label: "Estimate is at least 2 hours",
      detail: validation.estimateAtLeastTwoHours ? null : "Can't be fixed on this PR. The estimate is in the merged task file.",
    },
  ];
}

/** Re-check ignores whatever is in the box and uses the saved PR. Add uses only what was typed. */
export function resolvePullRequestUrl(input: string, saved: string | null | undefined, action: "add" | "recheck"): string {
  if (action === "recheck") return (saved ?? "").trim();
  return input.trim();
}

export function submitAction(addedCount: number, readyCount: number, sprint: number): { disabled: boolean; label: string; reason: string | null } {
  if (addedCount < 2) {
    return { disabled: true, label: `Submit Sprint ${sprint}`, reason: "Add both tasks to submit." };
  }
  if (readyCount >= 2) return { disabled: false, label: `Submit Sprint ${sprint}`, reason: null };
  return { disabled: false, label: `Submit Sprint ${sprint} anyway`, reason: null };
}

export function submitBarText(readyCount: number): string {
  return `${readyCount} of 2 ready · You can change your submission until the sprint closes.`;
}

export function sprintTabLabel(number: number, options: { submitted: boolean; released: boolean; score: number | null }): string {
  if (options.released && options.score != null) {
    const score = String(Number(options.score.toFixed(2)));
    return `Sprint ${number} · Graded ${score}`;
  }
  if (options.submitted) return `Sprint ${number} · Submitted`;
  return `Sprint ${number}`;
}

export function firstOpenSprint(count: number, isSubmitted: (number: number) => boolean): number {
  for (let number = 1; number <= count; number++) {
    if (!isSubmitted(number)) return number;
  }
  return 1;
}

/**
 * Whether a student may withdraw a submitted sprint to change it: before the
 * sprint's deadline and before a grade is released. A sprint without a
 * deadline stays open.
 */
export function canChangeSubmission(status: string, dueAt: string | null | undefined, now: Date = new Date()): boolean {
  if (status === "released") return false;
  if (!dueAt) return true;
  const due = new Date(dueAt);
  return Number.isNaN(due.valueOf()) || now < due;
}
