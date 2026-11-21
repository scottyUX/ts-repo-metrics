// Totals for the Benchmark page's re-capture section (#418). Types only from recapture.ts, so the page
// bundle does not pull in the capture code.
import type { RecaptureAction, RecapturePlan } from "./recapture";

/** One submission's answer on the page: its plan, or the error the POST returned. */
export type RecaptureResultRow = { submissionId: string; plan?: RecapturePlan; error?: string };

export const RECAPTURE_ACTIONS: RecaptureAction[] = ["replace", "keep", "back_to_candidate", "skip", "error"];

export type RecaptureTotals = {
  submissions: number;
  tasks: number;
  actions: Record<RecaptureAction, number>;
  codeChanged: number;
  /** Tasks whose action is error, plus submissions whose request failed. */
  errors: number;
  /** Tasks re-captured on the old range because the merge base could not be read. */
  fallback: number;
  /** Not-yet-released submissions with a task whose code files changed: staff may want to Regrade. */
  considerRegrade: number;
};

/** Whether the page shows "consider Regrade" for a task: its submission is not yet released and its code files changed. */
export function considerRegrade(plan: RecapturePlan, task: RecapturePlan["tasks"][number]): boolean {
  return !plan.released && task.codeChanged && (task.action === "replace" || task.action === "keep" || task.action === "back_to_candidate");
}

export function recaptureTotals(rows: RecaptureResultRow[]): RecaptureTotals {
  const totals: RecaptureTotals = {
    submissions: rows.length, tasks: 0, codeChanged: 0, errors: 0, fallback: 0, considerRegrade: 0,
    actions: { replace: 0, keep: 0, back_to_candidate: 0, skip: 0, error: 0 },
  };
  for (const row of rows) {
    if (!row.plan) {
      totals.errors++;
      continue;
    }
    let regrade = false;
    for (const task of row.plan.tasks) {
      totals.tasks++;
      totals.actions[task.action]++;
      if (task.codeChanged) totals.codeChanged++;
      if (task.action === "error") totals.errors++;
      if (task.fallback) totals.fallback++;
      if (considerRegrade(row.plan, task)) regrade = true;
    }
    if (regrade) totals.considerRegrade++;
  }
  return totals;
}

const ACTION_WORDS: Record<RecaptureAction, string> = {
  replace: "replace", keep: "keep", back_to_candidate: "back to candidate", skip: "skip", error: "error",
};

export function actionLabel(action: RecaptureAction): string {
  return ACTION_WORDS[action];
}

/** One plain line of counts for a status update: no repo names, task ids or students. */
export function copyTotalsLine(totals: RecaptureTotals, applied = false): string {
  const actions = RECAPTURE_ACTIONS.map((action) => `${totals.actions[action]} ${ACTION_WORDS[action]}`).join(", ");
  return `Old diffs ${applied ? "re-captured" : "checked (dry run)"}: ${totals.submissions} submissions, ${totals.tasks} tasks: ${actions}. `
    + `${totals.codeChanged} with code files changed, ${totals.fallback} on the old range (no merge base), ${totals.errors} errors, `
    + `${totals.considerRegrade} unreleased submissions to consider for Regrade.`;
}
