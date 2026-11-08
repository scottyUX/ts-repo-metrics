import { describe, expect, it } from "vitest";
import { duplicateTaskMessage } from "@/lib/cse115a/duplicateTask";

const task = { repoFullName: "team/app", prNumber: 12, taskId: "US-1-T-1" };
const PR_TAKEN = "This PR is already added by another student in this course. Each PR counts for one student's task. If you think this is an error, please contact a TA.";
const ID_TAKEN = "Task ID US-1-T-1 is already used by another student in team/app. Use a new task ID. If you think this is an error, please contact a TA.";

describe("duplicate task check (#336)", () => {
  it("rejects a PR another student already added, whatever the capitalization", () => {
    expect(duplicateTaskMessage([{ repo_full_name: "Team/App", pr_number: 12, task_id: "US-2-T-1" }], task)).toBe(PR_TAKEN);
  });

  it("rejects a task ID another student already used in the same repository, whatever the capitalization", () => {
    expect(duplicateTaskMessage([{ repo_full_name: "team/app", pr_number: 40, task_id: "us-1-t-1" }], task)).toBe(ID_TAKEN);
  });

  it("allows the same task ID in another repository, and another PR with another task ID", () => {
    expect(duplicateTaskMessage([
      { repo_full_name: "other/app", pr_number: 12, task_id: "US-1-T-1" },
      { repo_full_name: "team/app", pr_number: 13, task_id: "US-1-T-2" },
    ], task)).toBeNull();
  });
});