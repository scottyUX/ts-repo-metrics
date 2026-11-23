"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  boxExtremesLines, boxSourcesLine, formatDuration, formatShare, groupLabel,
  type GraderStats,
} from "@/lib/cse115a/graderStats";
import { fetchJson, formatPoints, type StaffCourse } from "./shared";

/** Every fixed sentence on the Grader page (#423), in the order it appears. */
export const GRADER_TEXT = {
  title: "Grader",
  intro: "How the AI score (what the grade job saved) compares with the final score (what staff saved, or the AI score when staff saved no change), on released tasks of current attempts. Staff see the AI's score before deciding, so this measures how often staff changed it, not how often two independent graders agree.",
  limits: [
    "A Regrade overwrites the AI's earlier score, so two grader versions cannot be compared on the same task.",
    "A task regraded after staff saved but before release cannot be told apart, so a few rows may compare staff's numbers with an AI score they did not see.",
    "The reason for a change is not stored.",
  ],
  empty: "No grades are released in this course yet, so there is nothing to compare. What the AI gave and the progress so far are below.",
  nothingYet: "Nothing has been submitted in this course yet.",
  totalsHeading: "Totals",
  totalsNote: "Per assignment and grader version, then all together. Same: the final total equals the AI total. Points added: final minus AI, summed. Accepted as it stood: the final equals the AI on all six boxes and the AI left none blank.",
  boxesHeading: "By rubric box",
  boxesNote: "AI left blank: the AI gave no score, or an older grade has no such box; these count in neither same, higher nor lower. Agreed: same, out of the tasks where the AI gave a score. Points added counts a blank AI box as 0. Needs review: tasks where the AI flagged the box.",
  aiGaveHeading: "What the AI gave",
  aiGaveNote: "Every current graded task, released or not. Full is all the box's points, half is half, zero is none, blank is no score.",
  progressHeading: "Progress",
  progressNote: "Current attempts only. Released includes the tasks regraded after release.",
  timeHeading: "Time",
  timeNote: "Waiting time, not grading time: the median from when a student submitted to when that submission was first released.",
  noTimer: "The site does not record time spent grading.",
} as const;

/** "12 released tasks were regraded after release …", always shown so a zero is visible too. */
export function regradedLine(count: number): string {
  return `${count} released ${count === 1 ? "task was" : "tasks were"} regraded after release. Staff never saw that AI score, so ${count === 1 ? "it is" : "they are"} left out of every agreement number.`;
}

/** "+14", "−2", "0". */
export function signedPoints(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${formatPoints(Math.abs(value))}`;
}

const cell = "px-3 py-2 text-right tabular-nums";
const head = "px-3 py-2 font-medium";

function Table({ columns, children, minWidth = "min-w-[720px]" }: { columns: string[]; children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className={`w-full ${minWidth} text-left text-sm`}>
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          <tr>{columns.map((column, index) => <th key={column} scope="col" className={`${head}${index === 0 ? "" : " text-right"}`}>{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function Section({ heading, note, children }: { heading: string; note: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{heading}</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">{note}</p>
      {children}
    </section>
  );
}

const rowClass = (all: boolean) => (all ? "bg-muted/40 font-medium" : "");

/** The Grader page for one course's numbers; no fetching, so tests can render it. */
export function GraderView({ heading, stats }: { heading: string; stats: GraderStats }) {
  const anyCompared = stats.comparedTasks > 0;
  const anything = stats.progress.length > 0;
  const showOther = stats.aiGave.some((row) => row.other > 0);
  return (
    <div className="w-full max-w-6xl space-y-6 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{heading}</p>
        <h1 className="mt-1 text-2xl font-semibold">{GRADER_TEXT.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{GRADER_TEXT.intro}</p>
        <ul className="mt-2 max-w-3xl list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {GRADER_TEXT.limits.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>

      {!anything ? <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{GRADER_TEXT.nothingYet}</p> : null}
      {anything && !anyCompared ? <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{GRADER_TEXT.empty}</p> : null}
      {anything ? <p className="text-sm">{regradedLine(stats.regradedAfterRelease)}</p> : null}

      {anyCompared ? (
        <Section heading={GRADER_TEXT.totalsHeading} note={GRADER_TEXT.totalsNote}>
          <Table columns={["Group", "Tasks released", "Same", "Final higher", "Final lower", "Points added", "Same (share)", "Accepted as it stood", "Accepted (share)"]}>
            {stats.totals.map((row) => (
              <tr key={groupLabel(row)} className={rowClass(row.assignment === null)}>
                <td className="px-3 py-2">{groupLabel(row)}</td>
                <td className={cell}>{row.released}</td>
                <td className={cell}>{row.same}</td>
                <td className={cell}>{row.higher}</td>
                <td className={cell}>{row.lower}</td>
                <td className={cell}>{signedPoints(row.pointsAdded)}</td>
                <td className={cell}>{formatShare(row.sameShare)}</td>
                <td className={cell}>{row.accepted}</td>
                <td className={cell}>{formatShare(row.acceptedShare)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      ) : null}

      {anyCompared ? (
        <Section heading={GRADER_TEXT.boxesHeading} note={GRADER_TEXT.boxesNote}>
          <div className="space-y-1 text-sm">
            {boxExtremesLines(stats).map((line) => <p key={line} className="font-medium">{line}</p>)}
            <p className="text-muted-foreground">{boxSourcesLine(stats.boxes)}</p>
          </div>
          <Table columns={["Box", "Group", "Tasks", "AI left blank", "Same", "Final higher", "Final lower", "Needs review", "Points added", "Agreed"]} minWidth="min-w-[900px]">
            {stats.boxes.flatMap((table) => table.rows.map((row, index) => (
              <tr key={`${table.box}-${groupLabel(row)}`} className={rowClass(row.assignment === null)}>
                <td className="px-3 py-2 font-medium">{index === 0 ? `${table.box} (${table.points})` : ""}</td>
                <td className="px-3 py-2 text-right">{groupLabel(row)}</td>
                <td className={cell}>{row.tasks}</td>
                <td className={cell}>{row.blank}</td>
                <td className={cell}>{row.same}</td>
                <td className={cell}>{row.higher}</td>
                <td className={cell}>{row.lower}</td>
                <td className={cell}>{row.needsReview}</td>
                <td className={cell}>{signedPoints(row.pointsAdded)}</td>
                <td className={cell}>{formatShare(row.agreedShare)}</td>
              </tr>
            )))}
          </Table>
        </Section>
      ) : null}

      {anything ? (
        <Section heading={GRADER_TEXT.aiGaveHeading} note={GRADER_TEXT.aiGaveNote}>
          <Table columns={["Box", "Full", "Half", "Zero", "Blank", ...(showOther ? ["Other"] : [])]} minWidth="min-w-[480px]">
            {stats.aiGave.map((row) => (
              <tr key={row.box}>
                <td className="px-3 py-2 font-medium">{row.box} ({row.points})</td>
                <td className={cell}>{row.full}</td>
                <td className={cell}>{row.half}</td>
                <td className={cell}>{row.zero}</td>
                <td className={cell}>{row.blank}</td>
                {showOther ? <td className={cell}>{row.other}</td> : null}
              </tr>
            ))}
          </Table>
        </Section>
      ) : null}

      {anything ? (
        <Section heading={GRADER_TEXT.progressHeading} note={GRADER_TEXT.progressNote}>
          <Table columns={["Assignment", "Tasks submitted", "Graded by the AI", "Saved by staff, not released", "Released", "Regraded after release"]} minWidth="min-w-[640px]">
            {stats.progress.map((row) => (
              <tr key={row.assignment}>
                <td className="px-3 py-2 font-medium">Assignment {row.assignment}</td>
                <td className={cell}>{row.submitted}</td>
                <td className={cell}>{row.graded}</td>
                <td className={cell}>{row.savedNotReleased}</td>
                <td className={cell}>{row.released}</td>
                <td className={cell}>{row.regradedAfterRelease}</td>
              </tr>
            ))}
          </Table>
        </Section>
      ) : null}

      {anything ? (
        <Section heading={GRADER_TEXT.timeHeading} note={GRADER_TEXT.timeNote}>
          <Table columns={["Assignment", "Submissions released", "Waiting time, not grading time (median)"]} minWidth="min-w-[480px]">
            {stats.waiting.map((row) => (
              <tr key={row.assignment}>
                <td className="px-3 py-2 font-medium">Assignment {row.assignment}</td>
                <td className={cell}>{row.submissions}</td>
                <td className={cell}>{formatDuration(row.medianMs)}</td>
              </tr>
            ))}
          </Table>
          <p className="text-sm text-muted-foreground">{GRADER_TEXT.noTimer}</p>
        </Section>
      ) : null}
    </div>
  );
}

export function GraderPanel({ slug }: { slug: string }) {
  const [stats, setStats] = useState<GraderStats | null>(null);
  const [course, setCourse] = useState<StaffCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchJson<GraderStats>(`/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/grader-stats`)
      .then(setStats)
      .catch((caught: Error) => setError(caught.message));
    // The course's name for the heading; the numbers route returns counts only.
    fetchJson<{ courses: StaffCourse[] }>("/api/cse115a/instructor/courses")
      .then((body) => setCourse(body.courses.find((item) => item.slug === slug) ?? null))
      .catch(() => setCourse(null));
  }, [slug]);

  const back = <Link href={`/cse115a/instructor?course=${encodeURIComponent(slug)}`} className="text-sm font-medium text-primary underline">← Submissions</Link>;
  if (error) return <div className="w-full max-w-6xl space-y-4 py-6">{back}<p role="alert" className="text-destructive">{error}</p></div>;
  if (!stats) return <p className="py-10 text-muted-foreground">Loading…</p>;
  return (
    <div className="w-full max-w-6xl pt-6">
      {back}
      <GraderView heading={course ? `${course.title} · ${course.term}` : slug} stats={stats} />
    </div>
  );
}
