"use client";

import { useEffect, useState } from "react";
import type { RecapturePlan } from "@/lib/cse115a/benchmark/recapture";
import {
  actionLabel, considerRegrade, copyTotalsLine, RECAPTURE_ACTIONS, recaptureTotals, type RecaptureResultRow,
} from "@/lib/cse115a/benchmark/recaptureTotals";
import { fetchJson } from "./shared";

// #418: diffs saved before the PR-own-diff rule (#382). A dry run checks every listed submission one at a
// time and shows what would change; re-capture is offered only after a dry run finished in this page load.
// Grades are never changed here: staff press Regrade themselves where the table suggests it.

type Listed = { id: string; assignmentNumber: number; status: string; oldRuleTasks: number };
type ListAnswer = { submissions: Listed[]; counts: { submissions: number; tasks: number } };
type PostAnswer = { plan: RecapturePlan };
type Phase = "idle" | "checking" | "checked" | "confirming" | "applying" | "applied";

export const RECAPTURE_TITLE = "Diffs saved before the PR-own-diff rule";

function files(list: string[]): string {
  return list.length ? list.join(", ") : "none";
}

export function OldDiffRecapture({ slug }: { slug: string }) {
  const url = `/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/recapture`;
  const [list, setList] = useState<ListAnswer | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [rows, setRows] = useState<RecaptureResultRow[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchJson<ListAnswer>(url).then(setList).catch((caught: Error) => setListError(caught.message));
  }, [url]);

  const run = async (apply: boolean) => {
    if (!list) return;
    setPhase(apply ? "applying" : "checking");
    setFailure(null);
    setCopied(false);
    const results: RecaptureResultRow[] = [];
    setRows([]);
    for (const [index, submission] of list.submissions.entries()) {
      setProgress(`${apply ? "Re-capturing" : "Checking"} ${index + 1} of ${list.submissions.length}…`);
      try {
        const answer = await fetchJson<PostAnswer>(url, { method: "POST", body: JSON.stringify({ submissionId: submission.id, apply }) });
        results.push({ submissionId: submission.id, plan: answer.plan });
      } catch (caught) {
        const message = (caught as Error).message;
        results.push({ submissionId: submission.id, error: message });
        setRows([...results]);
        if (apply) {
          // Stop at the first failure; the submissions after it are not touched.
          setFailure(`Stopped at submission ${index + 1} of ${list.submissions.length}: ${message}`);
          setProgress(null);
          setPhase("checked");
          return;
        }
        continue;
      }
      setRows([...results]);
    }
    setProgress(null);
    setPhase(apply ? "applied" : "checked");
  };

  if (listError) return <section className="space-y-2"><h2 className="font-semibold">{RECAPTURE_TITLE}</h2><p role="alert" className="text-sm text-destructive">{listError}</p></section>;
  if (!list) return <p className="text-sm text-muted-foreground">Loading saved diffs…</p>;

  const totals = recaptureTotals(rows);
  const busy = phase === "checking" || phase === "applying";
  const dryRunFinished = phase === "checked" || phase === "confirming";
  const n = list.counts.submissions;

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{RECAPTURE_TITLE}</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Submissions saved before the PR-own-diff rule still hold a diff from the PR&apos;s first commit or base to its merge commit, which can include a teammate&apos;s files. Re-capturing reads each PR again and saves the PR&apos;s own diff, as GitHub&apos;s &quot;Files changed&quot; shows it. Only the diff changes: the spec, checks, comments and grades stay, and the old snapshot is kept. Check first: the dry run changes nothing.
      </p>
      <p className="text-sm">{n} submissions, {list.counts.tasks} tasks to check.</p>
      {n > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => run(false)} className="rounded-lg border border-input px-4 py-2 text-sm font-medium disabled:opacity-50">Check all (dry run)</button>
          {phase === "confirming" ? (
            <>
              <button type="button" onClick={() => run(true)} className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">Yes, re-capture {n} submissions</button>
              <button type="button" onClick={() => setPhase("checked")} className="rounded-lg border border-input px-4 py-2 text-sm font-medium">Cancel</button>
            </>
          ) : (
            <button type="button" disabled={!dryRunFinished || busy} onClick={() => setPhase("confirming")} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Re-capture all</button>
          )}
          {!dryRunFinished && !busy && phase !== "applied" ? <span className="text-xs text-muted-foreground">Run the dry run first.</span> : null}
        </div>
      ) : <p className="text-sm text-muted-foreground">Nothing to re-capture.</p>}
      {progress ? <p className="text-sm text-muted-foreground" aria-live="polite">{progress}</p> : null}
      {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
      {phase === "applied" ? <p className="text-sm text-emerald-600">Re-captured {rows.length} submissions. Reload the page to see what is left.</p> : null}

      {rows.length > 0 ? (
        <>
          <p className="text-sm">
            {RECAPTURE_ACTIONS.map((action) => `${totals.actions[action]} ${actionLabel(action)}`).join(" · ")} · {totals.codeChanged} with code files changed · {totals.errors} errors
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Copy totals:</span>
            <code className="rounded bg-muted px-2 py-1 text-xs">{copyTotalsLine(totals, phase === "applied")}</code>
            <button type="button" className="text-xs font-medium text-primary underline" onClick={() => {
              navigator.clipboard?.writeText(copyTotalsLine(totals, phase === "applied")).then(() => setCopied(true)).catch(() => setCopied(false));
            }}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Task</th><th className="px-3 py-2">Old files → new files</th><th className="px-3 py-2">Code changed</th><th className="px-3 py-2">Row status</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Note</th></tr>
              </thead>
              <tbody>
                {rows.flatMap((row) => row.plan ? row.plan.tasks.map((task) => (
                  <tr key={`${row.submissionId}-${task.task.slot}`} className="border-t border-border align-top">
                    <td className="px-3 py-2"><span className="font-mono text-xs">{task.task.instanceId}</span><br /><span className="text-xs text-muted-foreground">Sprint {row.plan!.assignmentNumber} · task {task.task.slot}</span></td>
                    <td className="px-3 py-2 text-xs">
                      {task.old.files.length} → {task.new ? task.new.files.length : "—"}
                      {task.filesRemoved.length ? <><br /><span className="text-muted-foreground">removed:</span> {files(task.filesRemoved)}</> : null}
                      {task.filesAdded.length ? <><br /><span className="text-muted-foreground">added:</span> {files(task.filesAdded)}</> : null}
                      {task.old.diffTruncated ? <><br /><span className="text-amber-700">old diff was cut short</span></> : null}
                    </td>
                    <td className="px-3 py-2">{task.new ? (task.codeChanged ? "yes" : "no") : "—"}</td>
                    <td className="px-3 py-2">{task.row ?? "none"}</td>
                    <td className="px-3 py-2">{actionLabel(task.action)}{task.reason ? <><br /><span className="text-xs text-muted-foreground">{task.reason}</span></> : null}</td>
                    <td className="px-3 py-2 text-xs">
                      {considerRegrade(row.plan!, task) ? "consider Regrade" : null}
                      {task.fallback ? <><br />no merge base: re-captured on the old range</> : null}
                      {task.baseChanged ? <><br />starting commit changes: a new repo copy is needed</> : null}
                    </td>
                  </tr>
                )) : [(
                  <tr key={row.submissionId} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{row.submissionId}</td>
                    <td colSpan={5} className="px-3 py-2 text-destructive">{row.error}</td>
                  </tr>
                )])}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
