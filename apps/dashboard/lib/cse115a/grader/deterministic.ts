import { criterion, pointsFor, type CriterionGrade, type Level } from "@/lib/cse115a/rubric";
import type { SnapshotCheck } from "@/lib/cse115a/submissionSnapshot";

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

/** Grades "Process" from the checks recorded when the PR was imported. The Scrum card cannot be verified, so it is not scored here. */
export function gradeProcess(validation: Record<string, boolean>): CriterionGrade {
  const steps = [
    ["prMerged", "PR merged"],
    ["baseTagPushed", "base tag pushed"],
    ["doneTagOnMergeCommit", "done tag on the merge commit"],
  ] as const;
  const quotes = [...steps, ["specCommittedFirst", "spec committed first"] as const]
    .map(([key, label]) => `${label}: ${validation[key] === true ? "yes" : "no"}`);
  const missing = steps.filter(([key]) => validation[key] !== true).map(([, label]) => label);

  // Without a base tag the order of commits cannot be checked, so a missing
  // tag is a missing step rather than proof that the spec came late.
  if (validation.baseTagPushed !== true) {
    return evidenceGrade("Process", "partial", `Missing: ${missing.join(", ")}. Without the base tag, spec-first order could not be checked.`, quotes, true);
  }
  if (validation.specCommittedFirst !== true) {
    return evidenceGrade("Process", "none", "The first commit at the base tag was not the task file alone, so implementation did not follow the spec.", quotes);
  }
  if (missing.length === 0) return evidenceGrade("Process", "full", "Spec committed first, both tags pushed, and the PR is merged.", quotes);
  return evidenceGrade("Process", "partial", `Missing: ${missing.join(", ")}.`, quotes);
}
