"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "./shared";

// #298: which benchmark tasks have a repo copy for their current base commit, and the backfill.
// The copies themselves never come to the browser: only ids, repos, commits and outcome lines.

type TaskStatus = { instance_id: string; repo: string; base_commit: string; stored: boolean | null; error?: string };
type Status = { enabled: boolean; perRequest: number; tasks: TaskStatus[]; stored: number };
type CopyResult = { instance_id: string; outcome: "stored" | "already stored" | "failed"; reason?: string; line?: string };
type CopyAnswer = { results: CopyResult[]; remaining: number | null };

export function RepoCopies({ slug }: { slug: string }) {
  const url = `/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/benchmark/repo-copies`;
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchJson<Status>(url).then((next) => { setStatus(next); setError(null); }).catch((caught: Error) => setError(caught.message));
  }, [url]);
  useEffect(load, [load]);

  /** Applies one answer: stored tasks turn green, failures keep their line. */
  const apply = (results: CopyResult[]) => {
    setStatus((previous) => previous && {
      ...previous,
      tasks: previous.tasks.map((task) => {
        const result = results.find((r) => r.instance_id === task.instance_id);
        return result && result.outcome !== "failed" ? { ...task, stored: true, error: undefined } : task;
      }),
    });
    setFailures((previous) => {
      const next = { ...previous };
      for (const r of results) {
        if (r.outcome === "failed") next[r.instance_id] = r.line ?? "failed";
        else delete next[r.instance_id];
      }
      return next;
    });
  };

  /** Asks for copies until none are left or a request makes no progress; failed tasks are skipped after their first try. */
  const saveMissing = async () => {
    setBusy("all");
    setError(null);
    const skip: string[] = [];
    let done = 0;
    try {
      for (;;) {
        const answer = await fetchJson<CopyAnswer>(url, { method: "POST", body: JSON.stringify({ skip }) });
        apply(answer.results);
        for (const r of answer.results) if (r.outcome === "failed") skip.push(r.instance_id);
        done += answer.results.length;
        setProgress(`${done} tried, ${answer.remaining ?? 0} left`);
        if (answer.results.length === 0 || !answer.remaining) break;
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
      load();
    }
  };

  const retry = async (instanceId: string) => {
    setBusy(instanceId);
    setError(null);
    try {
      apply((await fetchJson<CopyAnswer>(url, { method: "POST", body: JSON.stringify({ instanceId }) })).results);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!status) return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading repo copies…</p>;
  const missing = status.tasks.filter((task) => task.stored !== true);
  const stored = status.tasks.length - missing.length;

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Repo copies</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        The validator needs each task&apos;s repository at its base commit. The site saves a copy in private storage at Submit,
        for every task whatever the consent answer (consent governs export, not validation). {stored} of {status.tasks.length} tasks
        have a copy for their current base commit.
      </p>
      {!status.enabled ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Repo copies are off on this site (CSE115A_REPO_COPIES is not &quot;on&quot;). This list still shows which tasks have one.</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!status.enabled || busy !== null || missing.length === 0}
          onClick={() => void saveMissing()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy === "all" ? "Saving…" : "Save missing repo copies"}
        </button>
        {progress ? <span className="text-sm text-muted-foreground">{progress}</span> : null}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {missing.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
          {missing.map((task) => (
            <li key={task.instance_id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2">
              <span className="font-mono">{task.instance_id}</span>
              <span className="text-muted-foreground">{task.repo} @ <span className="font-mono">{task.base_commit.slice(0, 12)}</span></span>
              <span className="text-muted-foreground">{task.stored === null ? "could not check" : "no copy"}</span>
              {status.enabled ? (
                <button type="button" disabled={busy !== null} onClick={() => void retry(task.instance_id)} className="rounded border border-input px-2 py-0.5 text-xs font-medium disabled:opacity-50">
                  {busy === task.instance_id ? "Copying…" : "Retry"}
                </button>
              ) : null}
              {failures[task.instance_id] ?? task.error ? <p className="basis-full text-destructive">{failures[task.instance_id] ?? task.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : status.tasks.length > 0 ? <p className="text-sm text-emerald-600">Every task has a copy.</p> : null}
    </section>
  );
}
