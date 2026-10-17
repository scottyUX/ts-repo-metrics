"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { splitPatch } from "@/lib/cse115a/diff";
import { RUBRIC, TASK_POINTS } from "@/lib/cse115a/rubric";
import { effectiveTotal, sprintScore, type TaskGradeRow } from "@/lib/cse115a/gradeReview";
import type { SubmissionSnapshot, TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";
import { fetchJson, formatPoints, STATUS_LABELS, type StaffCourse, type SubmissionStatus } from "./shared";

type Detail = {
  course: StaffCourse;
  submission: {
    id: string; assignment_number: number; attempt: number; status: SubmissionStatus; email: string | null;
    snapshot: SubmissionSnapshot; submitted_at: string; superseded_at: string | null; unlock_reason: string | null;
  };
  grades: TaskGradeRow[];
  releaseBlockers: string[];
  jobs: Array<{ kind: string; status: string; attempts: number; run_after: string; last_error: string | null; updated_at: string }>;
  history: Array<{ id: string; attempt: number; status: SubmissionStatus; submitted_at: string; superseded_at: string | null; unlock_reason: string | null }>;
};

const MAX_DIFF_DISPLAY = 200_000;

function DiffView({ diff, empty }: { diff: string; empty: string }) {
  if (!diff) return <p className="p-4 text-sm text-muted-foreground">{empty}</p>;
  const shown = diff.length > MAX_DIFF_DISPLAY ? diff.slice(0, MAX_DIFF_DISPLAY) : diff;
  return (
    <pre className="max-h-[28rem] overflow-auto p-3 font-mono text-xs leading-relaxed">
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

function TaskPanel({ submissionId, task, grade, onSaved, readOnly }: { submissionId: string; task: TaskSnapshot; grade: TaskGradeRow | undefined; onSaved: () => void; readOnly: boolean }) {
  const split = useMemo(() => splitPatch(task.diff), [task.diff]);
  const [draft, setDraft] = useState<Draft | null>(grade ? draftFrom(grade) : null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setDraft(grade ? draftFrom(grade) : null); }, [grade]);

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
          <span className="font-mono text-xs text-muted-foreground">base {task.baseCommit.slice(0, 7)}{task.baseCommitSource === "pr_base" ? " (PR base; no base tag)" : ""}</span>
        </div>
        {task.diffError ? <p className="mt-2 text-sm text-destructive">Diff not captured: {task.diffError}</p> : null}
        {task.diffTruncated ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">The diff was over 1 MB and was cut off.</p> : null}
      </div>

      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Task spec · {task.taskPath}</summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-border p-3 text-sm">{task.specMarkdown}</pre>
      </details>

      <Tabs defaultValue="patch" className="rounded-lg border border-border">
        <TabsList className="m-2">
          <TabsTrigger value="patch">patch ({split.sourceFiles.length})</TabsTrigger>
          <TabsTrigger value="test_patch">test_patch ({split.testFiles.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="patch"><DiffView diff={split.patch} empty="No source files changed." /></TabsContent>
        <TabsContent value="test_patch"><DiffView diff={split.testPatch} empty="No test files changed." /></TabsContent>
      </Tabs>

      <div>
        <h3 className="text-sm font-semibold">CI on the merge commit</h3>
        {task.checks.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">No checks recorded.</p> : (
          <ul className="mt-1 space-y-1 text-sm">
            {task.checks.map((check, index) => (
              <li key={index} className="flex justify-between gap-3"><span className="truncate">{check.name}</span><span className={check.conclusion === "success" ? "text-emerald-600" : check.conclusion ? "text-destructive" : "text-muted-foreground"}>{check.conclusion ?? check.status}</span></li>
            ))}
          </ul>
        )}
      </div>

      {!grade || !draft ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No agent grade yet.</p> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Rubric</h3>
            <p className="text-sm tabular-nums">Agent {formatPoints(Number(grade.agent_total), TASK_POINTS)} · Your total <strong>{formatPoints(draftTotal, TASK_POINTS)}</strong></p>
          </div>
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
  const sprint = grades.length ? sprintScore(grades.map(effectiveTotal)) : null;
  const gradeJob = detail.jobs.find((job) => job.kind === "grade");

  return (
    <div className="w-full max-w-7xl space-y-6 py-6">
      <Link href={`/cse115a/instructor?course=${encodeURIComponent(course.slug)}&assignment=${submission.assignment_number}`} className="text-sm font-medium text-primary underline">← Submissions</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{course.title} · {course.term} · Assignment {submission.assignment_number}</p>
          <h1 className="mt-1 text-2xl font-semibold">{submission.email ?? "Unknown student"}</h1>
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
        {tasks.map((task) => <TaskPanel key={task.slot} submissionId={submission.id} task={task} grade={grades.find((row) => row.task_slot === task.slot)} onSaved={() => void load()} readOnly={!active} />)}
      </div>

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
