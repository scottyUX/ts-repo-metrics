import { criterion, pointsFor, type CriterionGrade, type Level } from "@/lib/cse115a/rubric";
import type { SnapshotCheck, TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";

// Tests pass and Process come from evidence recorded at submit time, not from
// the language model.

const PASSING = new Set(["success"]);
const FAILING = new Set(["failure", "timed_out", "cancelled", "action_required", "error", "startup_failure"]);

function evidenceGrade(name: "Tests pass" | "Process", level: Level | null, rationale: string, evidenceQuotes: string[], needsReview = level === null): CriterionGrade {
  return {
    name,
    points: criterion(name).points,
    level,
    awarded: level === null ? null : pointsFor(name, level),
    rationale,
    evidenceQuotes,
    needsReview,
    source: "evidence",
  };
}

/** Grades "Tests pass" from check runs and commit statuses on the merge commit. Neutral, skipped, and pending checks are ignored. */
export function gradeTestsPass(checks: SnapshotCheck[]): CriterionGrade {
  const passed = checks.filter((check) => check.conclusion && PASSING.has(check.conclusion));
  const failed = checks.filter((check) => check.conclusion && FAILING.has(check.conclusion));
  const quotes = [...passed, ...failed].map((check) => `${check.name}: ${check.conclusion}`);
  if (passed.length + failed.length === 0) {
    return evidenceGrade("Tests pass", null, "No finished CI checks were recorded on the merge commit, so test results need a manual check.", []);
  }
  if (failed.length === 0) return evidenceGrade("Tests pass", "full", `All ${passed.length} CI checks passed on the merge commit.`, quotes);
  if (passed.length === 0) return evidenceGrade("Tests pass", "none", `All ${failed.length} CI checks failed on the merge commit.`, quotes);
  return evidenceGrade("Tests pass", "partial", `${failed.length} of ${passed.length + failed.length} CI checks failed on the merge commit.`, quotes);
}

/**
 * Grades "Process" from the checks recorded when the PR was imported. The Scrum card cannot be verified, so it is
 * not scored here. The task file came first when `specCommittedFirst` is true or the snapshot's diff starts at the
 * PR's first commit (`first_commit`): a task saved before #392 stored false when its base tag was missing, even
 * with the task file alone and first. A `merge_base` snapshot (#382) is graded on `specCommittedFirst` alone: its
 * diff starts at the merge base whatever came first, so the `first_commit` fallback never applies to it. Code
 * before the task file is always confirmed by a person.
 */
export function gradeProcess(validation: Record<string, boolean>, baseCommitSource?: TaskSnapshot["baseCommitSource"]): CriterionGrade {
  const merged = validation.prMerged === true;
  const fileFirst = validation.specCommittedFirst === true || baseCommitSource === "first_commit";
  const quotes = [`PR merged: ${merged ? "yes" : "no"}`, `task file first: ${fileFirst ? "yes" : "no"}`];
  if (!fileFirst) {
    return evidenceGrade("Process", "none", "The PR's first commit was not the task file alone, so the task file did not come before the code.", quotes, true);
  }
  if (!merged) return evidenceGrade("Process", "partial", "Missing: PR merged.", quotes);
  return evidenceGrade("Process", "full", "Task file committed first, and the PR is merged.", quotes);
}
