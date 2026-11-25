"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { splitPatch } from "@/lib/cse115a/diff";
import { baseCommitLine, manyTasksReviewLine, oneTaskReviewLine, specEstimateHours } from "@/lib/cse115a/processChecklist";
import { prTaskFileLines } from "@/lib/cse115a/sharedPr";
import { taskFilePrReviewLine } from "@/lib/cse115a/taskFilePr";
import { RUBRIC, TASK_POINTS } from "@/lib/cse115a/rubric";
import { effectiveTotal, submittedSprintScore, type TaskGradeRow } from "@/lib/cse115a/gradeReview";
import type { SubmissionSnapshot, TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import type { TaskCode } from "@/lib/cse115a/getTheCode";
import {
  getTheCodeChoiceNote, getTheCodeExtrasNote, repoCopyFromNote, staleAiGradeLine, WORK_PR_TEXT, workPrHeaderLine,
} from "@/lib/cse115a/workPr";
import { AiGradeHistory, type AiGradeEntry } from "./AiGradeHistory";
import { FixCodePr } from "./FixCodePr";
import { GetTheCode } from "./GetTheCode";
import { CopyButton, DiffBox, SpecBox } from "./ReviewBoxes";
import { copyAllText, EMPTY_TAB_TEXT, githubProfiles, REVIEW_TEXT, teamLinks, type DiffTab } from "@/lib/cse115a/reviewText";
import { fetchJson, formatPoints, STATUS_LABELS, type StaffCourse, type SubmissionStatus } from "./shared";

type Detail = {
  course: StaffCourse;
  submission: {
    id: string; assignment_number: number; attempt: number; status: SubmissionStatus; email: string | null;
    snapshot: SubmissionSnapshot & { recapturedAt?: string }; submitted_at: string; superseded_at: string | null; unlock_reason: string | null;
  };
  grades: TaskGradeRow[];
  releaseBlockers: string[];
  jobs: Array<{ kind: string; status: string; attempts: number; run_after: string; last_error: string | null; updated_at: string }>;
  history: Array<{ id: string; attempt: number; status: SubmissionStatus; submitted_at: string; superseded_at: string | null; unlock_reason: string | null }>;
  /** Each slot's "Get the code" entry; missing from a response made before it existed. */
  code?: TaskCode[];
  /** Every AI grade of each task, newest first (#429); missing from a response made before it existed. */
  aiGrades?: AiGradeEntry[];
};

const MAX_DIFF_DISPLAY = 200_000;

/** `full`: the box shows every line instead of today's 28rem (#440). */
function DiffView({ diff, empty, full = false }: { diff: string; empty: string; full?: boolean }) {
  if (!diff) return <p className="p-4 text-sm text-muted-foreground">{empty}</p>;
  const shown = diff.length > MAX_DIFF_DISPLAY ? diff.slice(0, MAX_DIFF_DISPLAY) : diff;
  return (
    <pre className={`${full ? "" : "max-h-[28rem] "}overflow-auto p-3 font-mono text-xs leading-relaxed`}>
      {shown.split("\n").map((line, index) => (
        <div key={index} className={
          line.startsWith("diff --git") ? "mt-3 font-semibold text-foreground first:mt-0"
            : line.startsWith("+") && !line.startsWith("+++") ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : line.startsWith("-") && !line.startsWith("---") ? "bg-red-500/10 text-red-800 dark:text-red-300"
                : line.startsWith("@@") ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground"
        }>{line || " "}</div>
      ))}
      {shown !== diff ? <div className="mt-2 text-muted-foreground">[Showing the first {MAX_DIFF_DISPLAY.toLocaleString()} characters.]</div> : null}
    </pre>
  );
}

type DiffSection = { key: string; prNumber: number; heading: string | null; split: ReturnType<typeof splitPatch> };

/**
 * The task's diff view in parts (#437): the main PR's diff, then each extra PR's under a heading naming the PR. A
 * task without extra PRs is one part with no heading, as before.
 */
export function diffSections(task: TaskSnapshot): DiffSection[] {
  const extras = task.extraCodePrs ?? [];
  if (extras.length === 0) return [{ key: "main", prNumber: task.prNumber, heading: null, split: splitPatch(task.diff) }];
  return [
    { key: "main", prNumber: task.prNumber, heading: WORK_PR_TEXT.mainDiffHeading(task.prNumber, task.pr.title), split: splitPatch(task.diff) },
    ...extras.map((extra) => ({ key: `pr-${extra.prNumber}`, prNumber: extra.prNumber, heading: WORK_PR_TEXT.extraDiffHeading(extra.prNumber, extra.title), split: splitPatch(extra.diff) })),
  ];
}

/** A section's stored text for one tab: the whole split, never the part the box shows. */
function sectionText(section: DiffSection, tab: DiffTab): string {
  return tab === "patch" ? section.split.patch : section.split.testPatch;
}

/** What a tab's "Copy all" copies (#440): every section's stored text, in the order shown, under its heading. */
export function tabCopyAll(sections: DiffSection[], tab: DiffTab): string {
  return copyAllText(sections.map((section) => ({ heading: section.heading, text: sectionText(section, tab) })), tab);
}

/**
 * One diff tab (#440): "Copy all" for the tab's whole stored text, and each section with its own full-height switch,
 * Full screen and Collapse (#448, #454) and, when the task has extra PRs, its own Copy. Copy all reads the stored
 * text, so it copies every section whole, collapsed or not.
 */
export function DiffTabBody({ sections, tab, slot }: { sections: DiffSection[]; tab: DiffTab; slot: number }) {
  const several = sections.length > 1;
  const anyText = sections.some((section) => sectionText(section, tab));
  return (
    <>
      {anyText ? (
        <div className="flex flex-wrap items-center gap-2 px-3">
          <CopyButton text={() => tabCopyAll(sections, tab)} label={REVIEW_TEXT.copyAll} ariaLabel={REVIEW_TEXT.copyAllLabel(tab)} />
        </div>
      ) : null}
      {sections.map((section) => {
        const text = sectionText(section, tab);
        return (
          <div key={section.key}>
            {section.heading ? <h4 className="mt-2 border-t border-border px-3 pt-3 text-sm font-semibold">{section.heading}</h4> : null}
            {text ? (
              <DiffBox what={several ? `PR #${section.prNumber}'s ${tab}` : `the ${tab}`} boxId={`task-${slot}-${tab}-${section.key}`}
                title={`Task ${slot} · ${several ? `PR #${section.prNumber}'s ${tab}` : tab}`}
                tools={several ? <CopyButton text={() => sectionText(section, tab)} label={REVIEW_TEXT.copy} ariaLabel={REVIEW_TEXT.copySectionLabel(tab, section.prNumber)} /> : null}
                fullScreenTools={<CopyButton text={() => sectionText(section, tab)} label={REVIEW_TEXT.copy}
                  ariaLabel={several ? REVIEW_TEXT.copySectionLabel(tab, section.prNumber) : REVIEW_TEXT.copyAllLabel(tab)} />}>
                {(full) => <DiffView diff={text} empty={EMPTY_TAB_TEXT[tab]} full={full} />}
              </DiffBox>
            ) : <DiffView diff="" empty={EMPTY_TAB_TEXT[tab]} />}
          </div>
        );
      })}
    </>
  );
}

function CheckList({ checks }: { checks: TaskSnapshot["checks"] }) {
  if (checks.length === 0) return <p className="mt-1 text-sm text-muted-foreground">No checks recorded.</p>;
  return (
    <ul className="mt-1 space-y-1 text-sm">
      {checks.map((check, index) => (
        <li key={index} className="flex justify-between gap-3"><span className="truncate">{check.name}</span><span className={check.conclusion === "success" ? "text-emerald-600" : check.conclusion ? "text-destructive" : "text-muted-foreground"}>{check.conclusion ?? check.status}</span></li>
      ))}
    </ul>
  );
}

type Draft = { values: Record<string, string>; notes: Record<string, string>; overall: string };

function draftFrom(grade: TaskGradeRow): Draft {
  const values: Record<string, string> = {};
  const notes: Record<string, string> = {};
  for (const row of RUBRIC) {
    const edited = grade.instructor_rubric?.find((item) => item.name === row.name);
    const agent = grade.rubric.find((item) => item.name === row.name);
    const awarded = edited ? edited.awarded : agent?.awarded ?? null;
    values[row.name] = awarded === null ? "" : String(awarded);
    notes[row.name] = edited?.note ?? "";
  }
  return { values, notes, overall: grade.instructor_notes ?? "" };
}

function TaskPanel({ submissionId, task, grade, onSaved, readOnly, sharedPr, code, aiGrades, recapturedAt }: { submissionId: string; task: TaskSnapshot; grade: TaskGradeRow | undefined; onSaved: () => void; readOnly: boolean; sharedPr: string[]; code: TaskCode | undefined; aiGrades: AiGradeEntry[]; recapturedAt: string | null }) {
  const sections = useMemo(() => diffSections(task), [task]);
  const sourceCount = sections.reduce((sum, section) => sum + section.split.sourceFiles.length, 0);
  const testCount = sections.reduce((sum, section) => sum + section.split.testFiles.length, 0);
  const extraNumbers = (task.extraCodePrs ?? []).map((extra) => extra.prNumber);
  const [draft, setDraft] = useState<Draft | null>(grade ? draftFrom(grade) : null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setDraft(grade ? draftFrom(grade) : null); }, [grade]);

  // #431: the AI grade is older than the last switch or undo of the task's code PR.
  const staleGrade = grade ? staleAiGradeLine(task, grade.graded_at) : null;
  const draftTotal = draft ? RUBRIC.reduce((sum, row) => sum + (Number(draft.values[row.name]) || 0), 0) : null;

  async function save(clear = false) {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const rubric = clear ? null : RUBRIC.map((row) => {
        const text = draft.values[row.name]?.trim() ?? "";
        if (text === "") throw new Error(`Enter points for ${row.name}.`);
        return { name: row.name, awarded: Number(text), note: draft.notes[row.name] ?? "" };
      });
      await fetchJson(`/api/cse115a/instructor/submissions/${submissionId}/grade`, { method: "PUT", body: JSON.stringify({ slot: task.slot, rubric, notes: draft.overall }) });
      setMessage(clear ? "Reverted to the agent grade." : "Saved.");
      onSaved();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Task {task.slot}</p>
        <h2 className="mt-1 text-lg font-semibold">{task.taskId} · {task.spec.title}</h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">PR #{task.prNumber}</a>
          <Link href={`/cse115a/instructor/submissions/${submissionId}/tasks/${task.slot}/metrics`} className="text-primary underline">Repo Metrics</Link>
          <span className="font-mono text-xs text-muted-foreground">{baseCommitLine(task.baseCommit, task.baseCommitSource)}</span>
        </div>
        {task.workPrChoice ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{workPrHeaderLine({ ...task, workPrChoice: task.workPrChoice })}</p>
          : task.taskFilePr ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{taskFilePrReviewLine(task.taskFilePr.number, task.prNumber, task.taskFilePr.fixesTaskPath)}</p> : null}
        {sharedPr.map((line) => <p key={line} className="mt-2 text-sm text-amber-700 dark:text-amber-300">{line}</p>)}
        {task.diffError ? <p className="mt-2 text-sm text-destructive">Diff not captured: {task.diffError}</p> : null}
        {task.diffTruncated ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">The diff was over 1 MB and was cut off.</p> : null}
      </div>

      <SpecBox markdown={task.specMarkdown} taskPath={task.taskPath} boxId={`task-${task.slot}-spec`} />

      <GetTheCode submissionId={submissionId} slot={task.slot} repoFullName={task.repoFullName} mergeCommit={task.pr?.mergeCommitSha} code={code}
        choiceNote={task.workPrChoice ? getTheCodeChoiceNote({ ...task, workPrChoice: task.workPrChoice }) : null}
        extrasNote={extraNumbers.length ? getTheCodeExtrasNote(task.prNumber, extraNumbers) : null}
        copyNote={task.repoCopyFrom && task.repoCopyFrom.prNumber !== task.prNumber ? repoCopyFromNote(task.repoCopyFrom.prNumber, task.prNumber) : null} />
      <FixCodePr submissionId={submissionId} task={task} recapturedAt={recapturedAt} readOnly={readOnly} onChanged={onSaved} />

      <Tabs defaultValue="patch" className="rounded-lg border border-border">
        <TabsList className="m-2">
          <TabsTrigger value="patch">patch ({sourceCount})</TabsTrigger>
          <TabsTrigger value="test_patch">test_patch ({testCount})</TabsTrigger>
        </TabsList>
        <TabsContent value="patch"><DiffTabBody sections={sections} tab="patch" slot={task.slot} /></TabsContent>
        <TabsContent value="test_patch"><DiffTabBody sections={sections} tab="test_patch" slot={task.slot} /></TabsContent>
      </Tabs>

      <div>
        <h3 className="text-sm font-semibold">CI on the merge commit</h3>
        <CheckList checks={task.checks} />
        {(task.extraCodePrs ?? []).map((extra) => (
          <div key={extra.prNumber} className="mt-3">
            <h3 className="text-sm font-semibold">{WORK_PR_TEXT.extraChecksHeading(extra.prNumber)}</h3>
            <CheckList checks={extra.checks} />
          </div>
        ))}
      </div>

      {!grade || !draft ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No agent grade yet.</p> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Rubric</h3>
            <p className="text-sm tabular-nums">Agent {formatPoints(Number(grade.agent_total), TASK_POINTS)} · Your total <strong>{formatPoints(draftTotal, TASK_POINTS)}</strong></p>
          </div>
          {staleGrade ? <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{staleGrade}</p> : null}
          <div className="divide-y divide-border rounded-lg border border-border">
            {RUBRIC.map((row) => {
              const agent = grade.rubric.find((item) => item.name === row.name);
              return (
                <div key={row.name} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                      {row.name}
                      {agent?.needsReview ? <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Needs review</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">Agent: {agent?.level ?? "no level"} · {formatPoints(agent?.awarded ?? null, row.points)} · {agent?.source === "evidence" ? "from recorded evidence" : "from the model"}</p>
                    <p className="text-sm">{agent?.rationale}</p>
                    {agent?.evidenceQuotes.length ? (
                      <details><summary className="cursor-pointer text-xs text-primary">Evidence ({agent.evidenceQuotes.length})</summary>
                        <ul className="mt-1 space-y-1">{agent.evidenceQuotes.map((quote, index) => <li key={index} className="border-l-2 border-border pl-2 font-mono text-xs text-muted-foreground">{quote}</li>)}</ul>
                      </details>
                    ) : null}
                    <input type="text" value={draft.notes[row.name] ?? ""} disabled={readOnly} placeholder="Note to student (optional)"
                      onChange={(event) => setDraft({ ...draft, notes: { ...draft.notes, [row.name]: event.target.value } })}
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                  </div>
                  <label className="text-xs text-muted-foreground">
                    Points / {row.points}
                    <input type="number" min={0} max={row.points} step={0.5} value={draft.values[row.name] ?? ""} disabled={readOnly}
                      onChange={(event) => setDraft({ ...draft, values: { ...draft.values, [row.name]: event.target.value } })}
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums text-foreground" />
                  </label>
                </div>
              );
            })}
          </div>
          <AiGradeHistory entries={aiGrades} />
          <label className="block text-sm">
            <span className="text-muted-foreground">Notes to the student</span>
            <textarea value={draft.overall} disabled={readOnly} onChange={(event) => setDraft({ ...draft, overall: event.target.value })} rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
          </label>
          <p className="text-xs text-muted-foreground">Graded {new Date(grade.graded_at).toLocaleString()} by {grade.model} ({grade.prompt_version}){grade.instructor_rubric ? " · edited by staff" : ""}</p>
          {readOnly ? null : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save task"}</button>
              {grade.instructor_rubric ? <button type="button" disabled={saving} onClick={() => void save(true)} className="rounded-lg border border-input px-4 py-2 text-sm font-medium">Use agent grade</button> : null}
              {message ? <span role="status" className="text-sm text-muted-foreground">{message}</span> : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * "Team: <repo>" and "GitHub: <username>" under the student's email (#440): the tasks' repositories and their PR
 * authors, each linked. A part with no value is left out.
 */
export function TeamLines({ tasks }: { tasks: Array<Pick<TaskSnapshot, "repoFullName"> & { pr?: { author?: string | null } | null }> }) {
  const teams = teamLinks(tasks.map((task) => task.repoFullName));
  const logins = githubProfiles(tasks.map((task) => task.pr?.author));
  if (!teams.length && !logins.length) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {teams.length ? (
        <span>{REVIEW_TEXT.teamLine}{" "}{teams.map((team, index) => (
          <span key={team.fullName}>{index ? ", " : ""}<a href={team.url} target="_blank" rel="noopener noreferrer" title={team.fullName} className="text-primary underline">{team.name}</a></span>
        ))}</span>
      ) : null}
      {logins.length ? (
        <span>{REVIEW_TEXT.githubLine}{" "}{logins.map((profile, index) => (
          <span key={profile.login}>{index ? ", " : ""}<a href={profile.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{profile.login}</a></span>
        ))}</span>
      ) : null}
    </p>
  );
}

export function SubmissionReview({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setDetail(await fetchJson<Detail>(`/api/cse115a/instructor/submissions/${id}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the submission.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(action: "release" | "regrade" | "unlock", body?: object) {
    setBusy(action);
    setNotice(null);
    try {
      await fetchJson(`/api/cse115a/instructor/submissions/${id}/${action}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      setNotice(action === "release" ? "Released to the student." : action === "regrade" ? "Grading queued. Refresh in a minute." : "Unlocked. The student can change tasks and submit again.");
      setUnlocking(false);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The action failed.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <div className="w-full max-w-3xl py-10"><p role="alert" className="text-destructive">{error}</p><Link href="/cse115a/instructor" className="mt-3 inline-block text-primary underline">← Submissions</Link></div>;
  if (!detail) return <p className="py-10 text-muted-foreground">Loading…</p>;

  const { submission, grades, course } = detail;
  const active = !submission.superseded_at;
  const tasks = [...submission.snapshot.tasks].sort((a, b) => a.slot - b.slot);
  const oneTask = tasks.length === 1 ? oneTaskReviewLine(specEstimateHours(tasks[0]!.spec)) : null;
  const manyTasks = manyTasksReviewLine(tasks.length);
  const sprint = submittedSprintScore(tasks.map((task) => task.slot), (slot) => {
    const grade = grades.find((row) => row.task_slot === slot);
    return grade ? effectiveTotal(grade) : null;
  });
  const gradeJob = detail.jobs.find((job) => job.kind === "grade");

  return (
    <div className="w-full max-w-7xl space-y-6 py-6">
      <Link href={`/cse115a/instructor?course=${encodeURIComponent(course.slug)}&assignment=${submission.assignment_number}`} className="text-sm font-medium text-primary underline">← Submissions</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{course.title} · {course.term} · Assignment {submission.assignment_number}</p>
          <h1 className="mt-1 text-2xl font-semibold">{submission.email ?? "Unknown student"}</h1>
          <TeamLines tasks={tasks} />
          <p className="mt-1 text-sm text-muted-foreground">
            Attempt {submission.attempt} · submitted {new Date(submission.submitted_at).toLocaleString()} · {active ? STATUS_LABELS[submission.status] : `Unlocked: ${submission.unlock_reason}`}
          </p>
          {gradeJob?.last_error ? <p className="mt-1 text-sm text-destructive">Last grading error ({gradeJob.status}, attempt {gradeJob.attempts}): {gradeJob.last_error}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Sprint score</p>
          <p className="text-2xl font-semibold tabular-nums">{formatPoints(sprint, TASK_POINTS)}</p>
        </div>
      </div>

      {active ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={Boolean(busy) || detail.releaseBlockers.length > 0 || submission.status === "grading"} onClick={() => void act("release")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy === "release" ? "Releasing…" : submission.status === "released" ? "Released" : "Release to student"}
          </button>
          <button type="button" disabled={Boolean(busy) || submission.status === "grading"} onClick={() => void act("regrade")} className="rounded-lg border border-input px-4 py-2 text-sm font-medium disabled:opacity-50">{busy === "regrade" ? "Queuing…" : "Regrade"}</button>
          {course.role === "instructor" ? <button type="button" disabled={Boolean(busy)} onClick={() => setUnlocking(true)} className="rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive disabled:opacity-50">Unlock</button> : null}
          {notice ? <span role="status" className="text-sm text-muted-foreground">{notice}</span> : null}
          {detail.releaseBlockers.length ? <ul className="w-full text-sm text-amber-700 dark:text-amber-300">{detail.releaseBlockers.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          {submission.status === "released" ? <p className="w-full text-sm text-muted-foreground">Released. Saved edits are visible to the student right away.</p> : null}
        </div>
      ) : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">This attempt was unlocked and is read-only.</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        {tasks.map((task) => <TaskPanel key={task.slot} submissionId={submission.id} task={task} grade={grades.find((row) => row.task_slot === task.slot)} onSaved={() => void load()} readOnly={!active} sharedPr={prTaskFileLines(tasks, task, "staff")} code={detail.code?.find((item) => item.slot === task.slot)} aiGrades={(detail.aiGrades ?? []).filter((item) => item.task_slot === task.slot)} recapturedAt={submission.snapshot.recapturedAt ?? null} />)}
      </div>
      {oneTask ? <p className={oneTask.warn ? "text-sm text-amber-700 dark:text-amber-300" : "text-sm text-muted-foreground"}>{oneTask.text}</p> : null}
      {manyTasks ? <p className="text-sm text-muted-foreground">{manyTasks}</p> : null}

      {detail.history.length > 1 ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Attempts</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {detail.history.map((item) => (
              <li key={item.id}>
                {item.id === submission.id ? <strong>Attempt {item.attempt}</strong> : <Link href={`/cse115a/instructor/submissions/${item.id}`} className="text-primary underline">Attempt {item.attempt}</Link>}
                {" · "}{new Date(item.submitted_at).toLocaleString()} · {item.superseded_at ? `unlocked (${item.unlock_reason})` : STATUS_LABELS[item.status]}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog open={unlocking} onOpenChange={setUnlocking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock this submission?</DialogTitle>
            <DialogDescription>The student can replace task PRs and submit again as a new attempt. This attempt and its grades are kept as history.</DialogDescription>
          </DialogHeader>
          <label className="block text-sm">
            <span className="text-muted-foreground">Reason (kept with the record)</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1" />
          </label>
          <DialogFooter>
            <DialogClose className="rounded-lg border border-input px-4 py-2 text-sm font-medium">Cancel</DialogClose>
            <button type="button" disabled={reason.trim().length < 3 || busy === "unlock"} onClick={() => void act("unlock", { reason })} className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Unlock</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
