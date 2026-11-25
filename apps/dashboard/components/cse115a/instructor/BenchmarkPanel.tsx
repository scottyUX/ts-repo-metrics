"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BenchmarkTaskTable } from "./BenchmarkTaskTable";
import { RepoCopies } from "./RepoCopies";
import { TASK_TABLE_TEXT } from "@/lib/cse115a/benchmark/taskTable";
import { fetchJson, type StaffCourse } from "./shared";

type Summary = {
  course: StaffCourse;
  counts: { sources: number; instances: number; candidate: number; validated: number; rejected: number; consented: number; flagged: number };
  exportEnabled: boolean;
};
type ConsentTotals = { enrolled: number; yes: number; no: number; notAnswered: number };

/** One line of research consent totals for the course; counts only, never who answered what. */
export function consentTotalsLine(totals: ConsentTotals): string {
  return `Research consent: ${totals.enrolled} enrolled · ${totals.yes} answered yes · ${totals.no} answered no · ${totals.notAnswered} not answered`;
}

export function BenchmarkPanel({ slug }: { slug: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentTotals, setConsentTotals] = useState<ConsentTotals | null>(null);
  const [consentTotalsError, setConsentTotalsError] = useState<string | null>(null);
  useEffect(() => {
    fetchJson<Summary>(`/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/benchmark`)
      .then(setSummary)
      .catch((caught: Error) => setError(caught.message));
    fetchJson<ConsentTotals>(`/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/consent-totals`)
      .then(setConsentTotals)
      .catch((caught: Error) => setConsentTotalsError(caught.message));
  }, [slug]);

  if (error) return <p role="alert" className="py-10 text-destructive">{error}</p>;
  if (!summary) return <p className="py-10 text-muted-foreground">Loading…</p>;
  const { counts, course } = summary;
  const exportUrl = `/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/benchmark.jsonl`;
  const harborUrl = `/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/benchmark-harbor.zip`;
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
      <p className="text-sm text-muted-foreground">{TASK_TABLE_TEXT.tilesNote}</p>
      <p className="text-sm text-muted-foreground">{consentTotals ? consentTotalsLine(consentTotals) : consentTotalsError ? `Research consent totals: ${consentTotalsError}` : "Research consent totals: loading…"}</p>
      {!summary.exportEnabled ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Export is off while CONSENT_APPROVED is false in lib/cse115a/consent.ts. Tasks are still captured, with personal information removed.</p> : null}
      <div className={`flex flex-wrap gap-3 ${summary.exportEnabled ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!summary.exportEnabled}>
        <a href={exportUrl} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Download JSONL</a>
        <a href={`${exportUrl}?validated=1`} className="rounded-lg border border-input px-4 py-2 text-sm font-medium">Validated only</a>
        <a href={harborUrl} className="rounded-lg border border-input px-4 py-2 text-sm font-medium">Download Harbor tasks (.zip)</a>
      </div>

      <RepoCopies slug={slug} />

      <section className="space-y-3">
        <BenchmarkTaskTable slug={slug} />
      </section>
    </div>
  );
}
