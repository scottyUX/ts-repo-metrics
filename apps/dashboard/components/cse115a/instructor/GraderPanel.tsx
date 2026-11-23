"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import {
  boxExtremesLines, boxSourcesLine, changedTaskLine, formatDuration, formatShare, groupLabel, reviewHref, scopeLabel,
  type ChangedTask, type GraderStats, type GraderStatsResponse, type ScopeStats,
} from "@/lib/cse115a/graderStats";
import { fetchJson, formatPoints } from "./shared";

/** Which way every table is grouped (#432). */
export type GraderScope = "assignment" | "quarter";

/** Every fixed sentence on the Grader page (#423), in the order it appears. */
export const GRADER_TEXT = {
  title: "Grader",
  intro: "How the AI score (the AI grade staff saw when they saved, or the newest AI grade when no save was recorded) compares with the final score (what staff saved, or the AI score when staff saved no change), on released tasks of current attempts. Staff see the AI's score before deciding, so this measures how often staff changed it, not how often two independent graders agree.",
  limits: [
    "Every AI grade is now kept, but a score a Regrade replaced before the history began is gone, and this page does not yet compare two grader versions on the same task.",
    "A staff save records its time and the AI grade on the task at that moment; a task regraded after it is compared with that grade and grouped under its version. Saves made before save times were kept have none, so a task regraded after one of them may compare staff's numbers with an AI score they did not see.",
    "The AI grade recorded is the one on the task when Save was pressed; a Regrade that finished while the review page was open is not noticed.",
    "The reason for a change is not stored.",
  ],
  scopeLegend: "Show the numbers",
  byAssignment: "By assignment",
  wholeQuarter: "Whole quarter",
  links: "A number of changed tasks that is not 0 opens the list of those tasks. Each links to its submission's staff review page, which shows every task of the submission; the task is the one with that number.",
  empty: "No grades are released in this course yet, so there is nothing to compare. What the AI gave and the progress so far are below.",
  nothingYet: "Nothing has been submitted in this course yet.",
  totalsHeading: "Totals",
  totalsNote: "A row per grader version, then the assignment's row (or the quarter's). Same: the final total equals the AI total. Points added: final minus AI, summed. Accepted as it stood: the final equals the AI on all six boxes and the AI left none blank.",
  boxesHeading: "By rubric box",
  boxesNote: "One row per box, for each assignment or for the quarter; grader versions are compared in Totals. AI left blank: the AI gave no score, or an older grade has no such box; these count in neither same, higher nor lower. Agreed: same, out of the tasks where the AI gave a score. Points added counts a blank AI box as 0. Needs review: tasks where the AI flagged the box.",
  aiGaveHeading: "What the AI gave",
  aiGaveNote: "Every current graded task, released or not. Full is all the box's points, half is half, zero is none, blank is no score.",
  progressHeading: "Progress",
  progressNote: "Current attempts only. Released includes the tasks regraded after release. Regraded after release counts every such task, including those compared with the AI grade staff saw.",
  timeHeading: "Time",
  timeNote: "Waiting time, not grading time: the median from when a student submitted to when that submission was first released. For the whole quarter, the median over every released submission.",
  noTimer: "The site does not record time spent grading.",
} as const;

/** The line under the heading naming the quarter (#432). */
export function quarterLine(term: string): string {
  return `These numbers are for ${term} only. Each quarter is its own course, with its own Grader page.`;
}

/** "12 released tasks were regraded after release …", always shown so a zero is visible too. */
export function regradedLine(count: number): string {
  return `${count} released ${count === 1 ? "task was" : "tasks were"} regraded after release. Staff never saw that AI score, so ${count === 1 ? "it is" : "they are"} left out of every agreement number.`;
}

/** How many compared tasks hold staff points with no recorded save time (#429), always shown so a zero is visible too. */
export function noSaveTimeLine(count: number, compared: number): string {
  return `${count} of ${compared} compared ${compared === 1 ? "task has" : "tasks have"} staff points with no recorded save time (saved before save times were kept), so ${count === 1 ? "it is" : "they are"} compared with the newest AI grade.`;
}

/** "+14", "−2", "0". */
export function signedPoints(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${formatPoints(Math.abs(value))}`;
}

/** The heading over one opened list: "Final higher than the AI: Specs, Fall 2026 · Assignment 2" (#432). */
export function changedListHeading(kind: ChangeKind, what: string): string {
  const lead = kind === "higher" ? "Final higher than the AI" : kind === "lower" ? "Final lower than the AI" : "AI left blank";
  return `${lead}: ${what}`;
}

type ChangeKind = "higher" | "lower" | "blank";

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

const rowClass = (scopeRow: boolean) => (scopeRow ? "bg-muted/40 font-medium" : "");

type Cell = { text: ReactNode; className?: string } | { kind: ChangeKind; count: number };

/**
 * A table row whose changed-task counts are buttons, each opening a list of links in a row under it (#432).
 * Every list is in the markup, hidden until opened, so a screen reader and the keyboard reach it like any button.
 */
function ExpandableRow({ cells, lists, what, className, columns }: {
  cells: Cell[]; lists: Partial<Record<ChangeKind, ChangedTask[]>>; what: string; className: string; columns: number;
}) {
  const [open, setOpen] = useState<ChangeKind | null>(null);
  const base = useId();
  const listId = (kind: ChangeKind) => `${base}-${kind}`;
  return (
    <>
      <tr className={className}>
        {cells.map((item, index) => {
          if (!("kind" in item)) return <td key={index} className={item.className ?? cell}>{item.text}</td>;
          if (item.count === 0) return <td key={index} className={cell}>0</td>;
          return (
            <td key={index} className={cell}>
              <button type="button" aria-expanded={open === item.kind} aria-controls={listId(item.kind)}
                aria-label={`${item.count}, ${open === item.kind ? "hide" : "show"} the tasks: ${changedListHeading(item.kind, what)}`}
                onClick={() => setOpen(open === item.kind ? null : item.kind)}
                className="font-medium text-primary underline underline-offset-2">
                {item.count}
              </button>
            </td>
          );
        })}
      </tr>
      {(["higher", "lower", "blank"] as const).map((kind) => {
        const tasks = lists[kind];
        if (!tasks || tasks.length === 0) return null;
        return (
          <tr key={kind} id={listId(kind)} hidden={open !== kind} className="bg-muted/20">
            <td colSpan={columns} className="px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">{changedListHeading(kind, what)}</p>
              <ul className="mt-1 space-y-0.5">
                {tasks.map((task) => (
                  <li key={`${task.submissionId}-${task.taskSlot}`}>
                    <Link href={reviewHref(task)} className="text-primary underline">{changedTaskLine(task)}</Link>
                  </li>
                ))}
              </ul>
            </td>
          </tr>
        );
      })}
    </>
  );
}

/** The two buttons choosing By assignment or Whole quarter. */
function ScopeToggle({ scope, onChange }: { scope: GraderScope; onChange: (scope: GraderScope) => void }) {
  const option = (value: GraderScope, label: string) => (
    <button type="button" aria-pressed={scope === value} onClick={() => onChange(value)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={GRADER_TEXT.scopeLegend} className="inline-flex gap-1 rounded-lg border border-border bg-card p-1">
      {option("assignment", GRADER_TEXT.byAssignment)}
      {option("quarter", GRADER_TEXT.wholeQuarter)}
    </div>
  );
}

/** The Grader page for one course's numbers; no fetching, so tests can render it. */
export function GraderView({ course, stats, initialScope = "assignment" }: {
  course: { title: string; term: string }; stats: GraderStats; initialScope?: GraderScope;
}) {
  const [scope, setScope] = useState<GraderScope>(initialScope);
  const term = course.term;
  const anyCompared = stats.comparedTasks > 0;
  const anything = stats.byAssignment.length > 0;
  const scopes: ScopeStats[] = scope === "quarter" ? [stats.quarter] : stats.byAssignment;
  const comparedScopes = scopes.filter((item) => item.comparedTasks > 0);
  const showOther = scopes.some((item) => item.aiGave.some((row) => row.other > 0));
  const groupColumn = scope === "quarter" ? "Quarter" : "Assignment";
  return (
    <div className="w-full max-w-6xl space-y-6 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{course.title}</p>
        <h1 className="mt-1 text-2xl font-semibold">{GRADER_TEXT.title} · {term}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{quarterLine(term)}</p>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{GRADER_TEXT.intro}</p>
        <ul className="mt-2 max-w-3xl list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {GRADER_TEXT.limits.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>

      {!anything ? <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{GRADER_TEXT.nothingYet}</p> : null}
      {anything && !anyCompared ? <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{GRADER_TEXT.empty}</p> : null}
      {anything ? <p className="text-sm">{regradedLine(stats.regradedAfterRelease)}</p> : null}
      {anyCompared ? <p className="text-sm">{noSaveTimeLine(stats.noSaveTime, stats.comparedTasks)}</p> : null}

      {anything ? (
        <div className="space-y-2">
          <ScopeToggle scope={scope} onChange={setScope} />
          {anyCompared ? <p className="max-w-3xl text-sm text-muted-foreground">{GRADER_TEXT.links}</p> : null}
        </div>
      ) : null}

      {anyCompared ? (
        <Section heading={GRADER_TEXT.totalsHeading} note={GRADER_TEXT.totalsNote}>
          <Table columns={["Group", "Tasks released", "Same", "Final higher", "Final lower", "Points added", "Same (share)", "Accepted as it stood", "Accepted (share)"]}>
            {comparedScopes.flatMap((item) => item.totals.map((row) => {
              const label = groupLabel(term, row);
              return (
                <ExpandableRow key={label} what={`total, ${label}`} className={rowClass(row.model === null)} columns={9}
                  lists={{ higher: row.higherTasks, lower: row.lowerTasks }}
                  cells={[
                    { text: label, className: "px-3 py-2" },
                    { text: row.released }, { text: row.same },
                    { kind: "higher", count: row.higher }, { kind: "lower", count: row.lower },
                    { text: signedPoints(row.pointsAdded) }, { text: formatShare(row.sameShare) },
                    { text: row.accepted }, { text: formatShare(row.acceptedShare) },
                  ]} />
              );
            }))}
          </Table>
        </Section>
      ) : null}

      {anyCompared ? (
        <Section heading={GRADER_TEXT.boxesHeading} note={GRADER_TEXT.boxesNote}>
          <div className="space-y-1 text-sm">
            {comparedScopes.flatMap((item) => boxExtremesLines(term, item)).map((line) => <p key={line} className="font-medium">{line}</p>)}
            <p className="text-muted-foreground">{boxSourcesLine(stats.quarter.boxes)}</p>
          </div>
          <Table columns={["Box", groupColumn, "Tasks", "AI left blank", "Same", "Final higher", "Final lower", "Needs review", "Points added", "Agreed"]} minWidth="min-w-[900px]">
            {stats.quarter.boxes.map((quarterBox, boxIndex) => (
              <Fragment key={quarterBox.box}>
                {comparedScopes.map((item, index) => {
                  const row = item.boxes[boxIndex]!;
                  const label = scopeLabel(term, item.assignment);
                  return (
                    <ExpandableRow key={label} what={`${row.box}, ${label}`} className="" columns={10}
                      lists={{ higher: row.higherTasks, lower: row.lowerTasks, blank: row.blankTasks }}
                      cells={[
                        { text: index === 0 ? `${row.box} (${row.points})` : "", className: "px-3 py-2 font-medium" },
                        { text: label, className: "px-3 py-2 text-right" },
                        { text: row.tasks }, { kind: "blank", count: row.blank }, { text: row.same },
                        { kind: "higher", count: row.higher }, { kind: "lower", count: row.lower },
                        { text: row.needsReview }, { text: signedPoints(row.pointsAdded) }, { text: formatShare(row.agreedShare) },
                      ]} />
                  );
                })}
              </Fragment>
            ))}
          </Table>
        </Section>
      ) : null}

      {anything ? (
        <Section heading={GRADER_TEXT.aiGaveHeading} note={GRADER_TEXT.aiGaveNote}>
          <Table columns={["Box", groupColumn, "Full", "Half", "Zero", "Blank", ...(showOther ? ["Other"] : [])]} minWidth="min-w-[640px]">
            {scopes.flatMap((item) => item.aiGave.map((row, index) => (
              <tr key={`${item.assignment}-${row.box}`} className={index === 0 && item !== scopes[0] ? "border-t-2 border-border" : ""}>
                <td className="px-3 py-2 font-medium">{row.box} ({row.points})</td>
                <td className="px-3 py-2 text-right">{scopeLabel(term, item.assignment)}</td>
                <td className={cell}>{row.full}</td>
                <td className={cell}>{row.half}</td>
                <td className={cell}>{row.zero}</td>
                <td className={cell}>{row.blank}</td>
                {showOther ? <td className={cell}>{row.other}</td> : null}
              </tr>
            )))}
          </Table>
        </Section>
      ) : null}

      {anything ? (
        <Section heading={GRADER_TEXT.progressHeading} note={GRADER_TEXT.progressNote}>
          <Table columns={[groupColumn, "Tasks submitted", "Graded by the AI", "Saved by staff, not released", "Released", "Regraded after release"]} minWidth="min-w-[640px]">
            {scopes.map((item) => (
              <tr key={String(item.assignment)} className={rowClass(item.assignment === null)}>
                <td className="px-3 py-2 font-medium">{scopeLabel(term, item.assignment)}</td>
                <td className={cell}>{item.progress.submitted}</td>
                <td className={cell}>{item.progress.graded}</td>
                <td className={cell}>{item.progress.savedNotReleased}</td>
                <td className={cell}>{item.progress.released}</td>
                <td className={cell}>{item.progress.regradedAfterRelease}</td>
              </tr>
            ))}
          </Table>
        </Section>
      ) : null}

      {anything ? (
        <Section heading={GRADER_TEXT.timeHeading} note={GRADER_TEXT.timeNote}>
          <Table columns={[groupColumn, "Submissions released", "Waiting time, not grading time (median)"]} minWidth="min-w-[480px]">
            {scopes.map((item) => (
              <tr key={String(item.assignment)} className={rowClass(item.assignment === null)}>
                <td className="px-3 py-2 font-medium">{scopeLabel(term, item.assignment)}</td>
                <td className={cell}>{item.waiting.submissions}</td>
                <td className={cell}>{formatDuration(item.waiting.medianMs)}</td>
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
  const [body, setBody] = useState<GraderStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // The route returns the course's title and term with the numbers (#432).
    fetchJson<GraderStatsResponse>(`/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/grader-stats`)
      .then(setBody)
      .catch((caught: Error) => setError(caught.message));
  }, [slug]);

  const back = <Link href={`/cse115a/instructor?course=${encodeURIComponent(slug)}`} className="text-sm font-medium text-primary underline">← Submissions</Link>;
  if (error) return <div className="w-full max-w-6xl space-y-4 py-6">{back}<p role="alert" className="text-destructive">{error}</p></div>;
  if (!body) return <p className="py-10 text-muted-foreground">Loading…</p>;
  return (
    <div className="w-full max-w-6xl pt-6">
      {back}
      <GraderView course={body.course} stats={body} />
    </div>
  );
}
