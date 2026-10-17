"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchJson, formatPoints, STATUS_LABELS, type StaffCourse, type SubmissionStatus } from "./shared";

type Row = {
  userId: string;
  email: string;
  submission: null | {
    id: string;
    attempt: number;
    status: SubmissionStatus;
    submittedAt: string;
    tasks: Array<{ slot: number; agentTotal: number | null; instructorTotal: number | null; needsReview: boolean }>;
    agentSprint: number | null;
    sprint: number | null;
    needsReview: boolean;
    jobError: string | null;
  };
};

const FILTERS = ["all", "not_submitted", "needs_review", "submitted", "grading", "graded", "grading_failed", "released"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = {
  all: "All students",
  not_submitted: "Not submitted",
  needs_review: "Needs review",
  submitted: STATUS_LABELS.submitted,
  grading: STATUS_LABELS.grading,
  graded: STATUS_LABELS.graded,
  grading_failed: STATUS_LABELS.grading_failed,
  released: STATUS_LABELS.released,
};

function matches(row: Row, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "not_submitted") return !row.submission;
  if (filter === "needs_review") return Boolean(row.submission?.needsReview && row.submission.status !== "released");
  return row.submission?.status === filter;
}

export function InstructorHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [courses, setCourses] = useState<StaffCourse[] | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const slug = searchParams.get("course") ?? courses?.[0]?.slug ?? null;
  const assignment = Number(searchParams.get("assignment") ?? 1);
  const course = courses?.find((item) => item.slug === slug) ?? null;
  const rowsUrl = course ? `/api/cse115a/instructor/courses/${encodeURIComponent(course.slug)}/submissions?assignment=${assignment}` : null;
  const rows = loaded && loaded.key === rowsUrl ? loaded.rows : null;

  const select = useCallback((next: { course?: string; assignment?: number }) => {
    const params = new URLSearchParams({ course: next.course ?? slug ?? "", assignment: String(next.assignment ?? assignment) });
    router.replace(`/cse115a/instructor?${params}`);
  }, [router, slug, assignment]);

  useEffect(() => {
    fetchJson<{ courses: StaffCourse[] }>("/api/cse115a/instructor/courses")
      .then((body) => setCourses(body.courses))
      .catch((caught: Error & { status?: number }) => {
        if (caught.status === 401) router.replace("/cse115a/signin");
        else setError(caught.message);
      });
  }, [router]);

  useEffect(() => {
    if (!rowsUrl) return;
    fetchJson<{ rows: Row[] }>(rowsUrl)
      .then((body) => { setLoaded({ key: rowsUrl, rows: body.rows }); setError(null); })
      .catch((caught: Error) => setError(caught.message));
  }, [rowsUrl]);

  const visible = useMemo(() => (rows ?? []).filter((row) => matches(row, filter)), [rows, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((item) => [item, (rows ?? []).filter((row) => matches(row, item)).length])), [rows]);

  if (courses && courses.length === 0) {
    return <div className="w-full max-w-3xl py-10"><h1 className="text-2xl font-semibold">Instructor</h1><p className="mt-2 text-muted-foreground">Your account is not on the staff of any course. Ask an instructor to add your UCSC email.</p></div>;
  }

  return (
    <div className="w-full max-w-6xl space-y-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Instructor</p>
          <h1 className="mt-1 text-2xl font-semibold">Submissions</h1>
        </div>
        {course ? (
          <nav className="flex gap-3 text-sm" aria-label="Course tools">
            <Link href={`/cse115a/instructor/courses/${encodeURIComponent(course.slug)}/benchmark`} className="rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted">Benchmark</Link>
            <Link href={`/cse115a/instructor/courses/${encodeURIComponent(course.slug)}/staff`} className="rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted">Staff</Link>
          </nav>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Course</span>
          <select value={slug ?? ""} onChange={(event) => select({ course: event.target.value, assignment: 1 })} className="rounded-lg border border-input bg-background px-3 py-2">
            {(courses ?? []).map((item) => <option key={item.id} value={item.slug}>{item.title} · {item.term}{item.role === "ta" ? " (TA)" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Assignment</span>
          <select value={assignment} onChange={(event) => select({ assignment: Number(event.target.value) })} className="rounded-lg border border-input bg-background px-3 py-2">
            {Array.from({ length: course?.assignment_count ?? 1 }, (_, index) => index + 1).map((number) => <option key={number} value={number}>Assignment {number}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Show</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="rounded-lg border border-input bg-background px-3 py-2">
            {FILTERS.map((item) => <option key={item} value={item}>{FILTER_LABELS[item]} ({counts[item] ?? 0})</option>)}
          </select>
        </label>
      </div>

      {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Task 1</th>
              <th className="px-4 py-3 text-right font-medium">Task 2</th>
              <th className="px-4 py-3 text-right font-medium">Sprint</th>
              <th className="px-4 py-3"><span className="sr-only">Review</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows === null && !error ? <tr><td colSpan={7} className="px-4 py-6 text-muted-foreground">Loading…</td></tr> : null}
            {rows && visible.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-muted-foreground">No students match.</td></tr> : null}
            {visible.map((row) => {
              const submission = row.submission;
              return (
                <tr key={row.userId} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{row.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{submission ? `${new Date(submission.submittedAt).toLocaleString()}${submission.attempt > 1 ? ` · attempt ${submission.attempt}` : ""}` : "—"}</td>
                  <td className="px-4 py-3">
                    {submission ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{STATUS_LABELS[submission.status]}</span>
                        {submission.needsReview && submission.status !== "released" ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Needs review</span> : null}
                      </span>
                    ) : <span className="text-muted-foreground">Not submitted</span>}
                    {submission?.jobError ? <p className="mt-1 max-w-xs truncate text-xs text-destructive" title={submission.jobError}>{submission.jobError}</p> : null}
                  </td>
                  {[1, 2].map((slot) => {
                    const task = submission?.tasks.find((item) => item.slot === slot);
                    return (
                      <td key={slot} className="px-4 py-3 text-right tabular-nums">
                        {task?.instructorTotal !== null && task?.instructorTotal !== undefined
                          ? <span title={`Agent: ${formatPoints(task.agentTotal)}`}>{formatPoints(task.instructorTotal)}</span>
                          : <span className="text-muted-foreground">{formatPoints(task?.agentTotal ?? null)}</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatPoints(submission?.sprint ?? null)}</td>
                  <td className="px-4 py-3 text-right">{submission ? <Link href={`/cse115a/instructor/submissions/${submission.id}`} className="font-medium text-primary underline">Review</Link> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">Gray totals are the agent&apos;s draft; dark totals include instructor edits. Sprint is the average of the two tasks. Students see nothing until you release.</p>
    </div>
  );
}
