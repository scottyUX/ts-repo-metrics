"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "./shared";

// #298: each benchmark task's repo copy (stored, queued, running, failed with its reason, or missing),
// and buttons that queue repo_copy jobs. The copies run on the server's copy line, never in this
// request, and never come to the browser: only ids, repos, commits, states and reasons.

type State = "stored" | "queued" | "running" | "failed" | "missing" | "unknown";
type Task = { instance_id: string; repo: string; base_commit: string; state: State; reason: string | null };
type Status = { enabled: boolean; tasks: Task[] };

const LABELS: Record<State, string> = {
  stored: "stored", queued: "queued", running: "running", failed: "failed", missing: "no copy", unknown: "could not check",
};
const TONES: Record<State, string> = {
  stored: "text-emerald-600", queued: "text-muted-foreground", running: "text-primary", failed: "text-destructive", missing: "text-muted-foreground", unknown: "text-amber-700",
};
const REFRESH_MS = 5_000;

export function RepoCopies({ slug }: { slug: string }) {
  const url = `/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/benchmark/repo-copies`;
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchJson<Status>(url).then((next) => { setStatus(next); setError(null); }).catch((caught: Error) => setError(caught.message));
  }, [url]);
  useEffect(load, [load]);
  // While copies are queued or running, look again every few seconds.
  const active = status?.tasks.some((task) => task.state === "queued" || task.state === "running") ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const queue = async (key: string, body: object) => {
    setBusy(key);
    setError(null);
    try {
      const answer = await fetchJson<{ queued: string[]; submissions: number }>(url, { method: "POST", body: JSON.stringify(body) });
      setNote(answer.queued.length ? `Queued ${answer.queued.length} task(s) in ${answer.submissions} copy job(s). They run on the server; this list updates as they finish.` : "Nothing to queue.");
      load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!status) return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading repo copies…</p>;
  const stored = status.tasks.filter((task) => task.state === "stored").length;
  const rest = status.tasks.filter((task) => task.state !== "stored");
  const canQueue = rest.some((task) => task.state === "missing" || task.state === "failed" || task.state === "unknown");

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Repo copies</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        The validator needs each task&apos;s repository at its base commit. The site saves a copy in private storage after Submit,
        on its own job line so grading never waits on it, for every task whatever the consent answer (consent governs export,
        not validation). {stored} of {status.tasks.length} tasks have a copy for their current base commit.
      </p>
      {!status.enabled ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Repo copies are off on this site (CSE115A_REPO_COPIES is not &quot;on&quot;). This list still shows which tasks have one.</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!status.enabled || busy !== null || !canQueue}
          onClick={() => void queue("all", {})}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy === "all" ? "Queuing…" : "Save missing repo copies"}
        </button>
        {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {rest.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
          {rest.map((task) => (
            <li key={task.instance_id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2">
              <span className="font-mono">{task.instance_id}</span>
              <span className="text-muted-foreground">{task.repo} @ <span className="font-mono">{task.base_commit.slice(0, 12)}</span></span>
              <span className={TONES[task.state]}>{LABELS[task.state]}</span>
              {status.enabled && task.state !== "queued" && task.state !== "running" ? (
                <button type="button" disabled={busy !== null} onClick={() => void queue(task.instance_id, { instanceId: task.instance_id })} className="rounded border border-input px-2 py-0.5 text-xs font-medium disabled:opacity-50">
                  {busy === task.instance_id ? "Queuing…" : "Retry"}
                </button>
              ) : null}
              {task.reason ? <p className={`basis-full ${task.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{task.state === "queued" ? `Last try: ${task.reason}` : task.reason}</p> : null}
            </li>
          ))}
        </ul>
      ) : status.tasks.length > 0 ? <p className="text-sm text-emerald-600">Every task has a copy.</p> : null}
    </section>
  );
}
