"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson, type StaffCourse } from "./shared";

type Preview = {
  instance_id: string;
  user_id: string;
  task_slot: number;
  validation_status: "candidate" | "validated" | "rejected";
  flags: string[];
  created_at: string;
  consented: boolean;
  task: null | {
    repo: string; base_commit: string; created_at: string | null; version: string; difficulty: string | null;
    FAIL_TO_PASS: string[]; problem_statement: string; patch: string; test_patch: string;
  };
};
type Summary = {
  course: StaffCourse;
  counts: { sources: number; instances: number; candidate: number; validated: number; rejected: number; consented: number; flagged: number };
  preview: Preview[];
  exportEnabled: boolean;
};

export function BenchmarkPanel({ slug }: { slug: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchJson<Summary>(`/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/benchmark`)
      .then(setSummary)
      .catch((caught: Error) => setError(caught.message));
  }, [slug]);

  if (error) return <p role="alert" className="py-10 text-destructive">{error}</p>;
  if (!summary) return <p className="py-10 text-muted-foreground">Loading…</p>;
  const { counts, course } = summary;
  const exportUrl = `/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/benchmark.jsonl`;
  const stats: Array<[string, number]> = [
    ["Captured tasks", counts.sources], ["Unique instances", counts.instances], ["Consented", counts.consented],
    ["Candidate", counts.candidate], ["Validated", counts.validated], ["Rejected", counts.rejected], ["Flagged", counts.flagged],
  ];

  return (
    <div className="w-full max-w-6xl space-y-6 py-6">
      <Link href={`/cse115a/instructor?course=${encodeURIComponent(slug)}`} className="text-sm font-medium text-primary underline">← Submissions</Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{course.title} · {course.term}</p>
        <h1 className="mt-1 text-2xl font-semibold">Benchmark</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Every final task is captured as a SWE-bench instance, with emails, logins, and known names removed before it is stored. Export includes only students who consented to the current wording, and skips rejected rows. FAIL_TO_PASS is parsed from the tests and is not yet verified by a test run.</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {!summary.exportEnabled ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Export is off until the IRB-approved consent wording replaces the placeholder. Tasks are still captured, with personal information removed.</p> : null}
      <div className={`flex flex-wrap gap-3 ${summary.exportEnabled ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!summary.exportEnabled}>
        <a href={exportUrl} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Download JSONL</a>
        <a href={`${exportUrl}?validated=1`} className="rounded-lg border border-input px-4 py-2 text-sm font-medium">Validated only</a>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Newest rows</h2>
        {summary.preview.length === 0 ? <p className="text-sm text-muted-foreground">No tasks captured yet.</p> : null}
        {summary.preview.map((row) => (
          <details key={`${row.instance_id}-${row.created_at}-${row.task_slot}`} className="rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="font-mono font-medium">{row.instance_id}</span>
              <span className="text-muted-foreground">{row.task?.version} · {row.task?.difficulty ?? "no estimate"}</span>
              <span className={row.consented ? "text-emerald-600" : "text-muted-foreground"}>{row.consented ? "consented" : "no consent"}</span>
              <span className="text-muted-foreground">{row.validation_status}</span>
              {row.flags.map((flag) => <span key={flag} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">{flag}</span>)}
            </summary>
            {row.task ? (
              <div className="space-y-3 border-t border-border p-4 text-sm">
                <p><span className="text-muted-foreground">repo</span> {row.task.repo} · <span className="text-muted-foreground">base_commit</span> <span className="font-mono">{row.task.base_commit}</span> · <span className="text-muted-foreground">created_at</span> {row.task.created_at ?? "—"}</p>
                <div><p className="text-muted-foreground">FAIL_TO_PASS ({row.task.FAIL_TO_PASS.length})</p><ul className="font-mono text-xs">{row.task.FAIL_TO_PASS.map((test) => <li key={test}>{test}</li>)}</ul></div>
                {(["problem_statement", "patch", "test_patch"] as const).map((field) => (
                  <div key={field}><p className="text-muted-foreground">{field} (preview)</p><pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">{row.task![field] || "(empty)"}</pre></div>
                ))}
              </div>
            ) : null}
          </details>
        ))}
      </section>
    </div>
  );
}
