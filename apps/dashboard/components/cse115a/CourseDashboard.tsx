"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildOAuthCallbackUrl, getOAuthRedirectOrigin, stashOAuthNextPath, stashOAuthProvider } from "@/lib/oauthRedirectOrigin";
import { parsePullRequestUrl, type TaskSpec } from "@/lib/cse115a/taskSpec";
import { runAnalyzeFromUrl } from "@/lib/runAnalyze";
import { sprintScore, type StudentTaskGrade } from "@/lib/cse115a/gradeReview";
import { RUBRIC } from "@/lib/cse115a/rubric";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/lib/cse115a/consent";
import {
  firstOpenSprint,
  processChecklist,
  resolvePullRequestUrl,
  sprintReady,
  sprintTabLabel,
  submitAction,
  canChangeSubmission,
  submitBarText,
  type TaskFacts,
} from "@/lib/cse115a/processChecklist";
import { ProcessChecklist } from "@/components/cse115a/ProcessChecklist";
import { Cse115aStudentBar } from "@/components/cse115a/Cse115aStudentBar";
import { CourseSetup } from "@/components/cse115a/CourseSetup";
import { SprintChecklistDialog } from "@/components/cse115a/SprintChecklistDialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SprintDue = { number: number; due_at: string | null };
type Course = { id: string; slug: string; title: string; term: string; assignment_count: number; sprints?: SprintDue[] };
type Submission = {
  id: string;
  course_id: string;
  assignment_number: number;
  task_slot: number;
  task_id: string;
  pr_url: string;
  task_path: string;
  task_spec_json: TaskSpec;
  validation_json: Record<string, boolean>;
  facts_json: Partial<TaskFacts> | null;
  scrum_board: boolean;
  analysis_result_id: string | null;
  updated_at: string;
};
type AssignmentSubmissionStatus = "submitted" | "grading" | "graded" | "released" | "grading_failed";
type AssignmentSubmission = {
  id: string;
  course_id: string;
  assignment_number: number;
  attempt: number;
  status: AssignmentSubmissionStatus;
  submitted_at: string;
  releasedScore?: number | null;
};
export type PreviewState = "joined" | "draft" | "ready" | "submitted" | "needs-fixes" | "grading" | "released";
type ReleasedGrade = StudentTaskGrade & { assignmentSubmissionId: string };
type Consent = { course_id: string; consented: boolean; consent_version: string; updated_at: string };
type Me = { email: string; courses: Course[]; submissions: Submission[]; assignmentSubmissions: AssignmentSubmission[]; grades: ReleasedGrade[]; consent: Consent[] };

const POLL_MS = 20_000;

// Fixed so server and client render the same preview.
const PREVIEW_TIME = "2026-09-30T19:12:00Z";

const previewCourse: Course = {
  id: "preview-course", slug: "CSE115A-Fall26", title: "CSE 115A", term: "Fall 2026", assignment_count: 5,
};
const passValidation: Record<string, boolean> = {
  prMerged: true, specCommittedFirst: true, baseTagPushed: true, doneTagOnMergeCommit: true,
  prAuthoredByStudent: true, prTitleHasTaskId: true, branchHasTaskId: true, estimateAtLeastTwoHours: true,
};
const noCi: TaskFacts = { ci: { state: "none", failed: 0, total: 0 }, testFileCount: 1, mergeSha: "9f3c2a1", firstCommitSha: "a1b2c3d" };

function previewTask(slot: number, assignmentNumber: number, validation: Record<string, boolean>, facts: TaskFacts): Submission {
  return {
    id: `preview-task-${assignmentNumber}-${slot}`, course_id: previewCourse.id, assignment_number: assignmentNumber, task_slot: slot,
    task_id: slot === 1 ? "US-4-T-2" : "US-4-T-3",
    pr_url: `https://github.com/example/team-project/pull/${40 + slot}`,
    task_path: `docs/tasks/sprint-${assignmentNumber}/US-4-T-${slot + 1}.md`,
    task_spec_json: { title: slot === 1 ? "Show an error when upload is too large" : "Reject an empty upload", description: "Example task." } as TaskSpec,
    validation_json: validation, facts_json: facts, scrum_board: false, analysis_result_id: "preview-result", updated_at: PREVIEW_TIME,
  };
}

function previewMe(state: PreviewState): Me {
  const email = "student@ucsc.edu";
  const consent: Consent[] = [{ course_id: previewCourse.id, consented: true, consent_version: CONSENT_VERSION, updated_at: PREVIEW_TIME }];
  const base = { email, courses: [previewCourse], grades: [] as ReleasedGrade[], consent };
  if (state === "joined") return { ...base, consent: [], submissions: [], assignmentSubmissions: [] };
  if (state === "draft") {
    return { ...base, assignmentSubmissions: [], submissions: [previewTask(1, 1, { ...passValidation, baseTagPushed: false }, noCi)] };
  }
  if (state === "ready") {
    return { ...base, assignmentSubmissions: [], submissions: [previewTask(1, 1, passValidation, noCi), previewTask(2, 1, passValidation, noCi)] };
  }
  const sprint1: AssignmentSubmission = {
    id: "preview-submission", course_id: previewCourse.id, assignment_number: 1, attempt: 1,
    status: state === "released" ? "released" : state === "grading" ? "grading" : "submitted",
    submitted_at: PREVIEW_TIME, releasedScore: state === "released" ? 7.75 : null,
  };
  const sprint1Tasks = [previewTask(1, 1, passValidation, noCi), previewTask(2, 1, passValidation, noCi)];
  if (state === "needs-fixes") {
    return {
      ...base, assignmentSubmissions: [sprint1],
      submissions: [...sprint1Tasks, previewTask(1, 2, { ...passValidation, doneTagOnMergeCommit: false }, noCi), previewTask(2, 2, passValidation, noCi)],
    };
  }
  const criteria = (lost: Record<string, [number, string]>) => RUBRIC.map((row) => ({
    name: row.name, points: row.points, awarded: lost[row.name]?.[0] ?? row.points, rationale: "", note: lost[row.name]?.[1] ?? "",
  }));
  const grades: ReleasedGrade[] = state === "released" ? [
    { assignmentSubmissionId: sprint1.id, slot: 1, total: 8.5, criteria: criteria({ Specs: [1.5, "Edge cases for an empty file are missing."], "Test quality": [0, ""] }), notes: "", releasedAt: PREVIEW_TIME },
    { assignmentSubmissionId: sprint1.id, slot: 2, total: 7, criteria: criteria({ Specs: [1, "Name the endpoint your tests call."], "Acceptance criteria": [1, ""], "Test quality": [0, ""] }), notes: "", releasedAt: PREVIEW_TIME },
  ] : [];
  return { ...base, grades, assignmentSubmissions: [sprint1], submissions: sprint1Tasks };
}

const STEPS = ["Submitted", "Grading", "Awaiting instructor review", "Grade released"] as const;
const STEP_INDEX: Record<AssignmentSubmissionStatus, number> = { submitted: 0, grading: 1, graded: 2, grading_failed: 2, released: 3 };

function StatusSteps({ status }: { status: AssignmentSubmissionStatus }) {
  const current = STEP_INDEX[status];
  return (
    <ol className="mt-3 flex flex-wrap gap-2 text-xs font-medium" aria-label="Grading progress">
      {STEPS.map((step, index) => (
        <li key={step} aria-current={index === current ? "step" : undefined}
          className={`rounded-full border px-3 py-1 ${index < current ? "border-primary/40 text-primary" : index === current ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
          {step}
        </li>
      ))}
    </ol>
  );
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatScore(value: number): string {
  return String(Number(value.toFixed(2)));
}

async function jsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  return response.json() as Promise<T & { error?: string }>;
}

export function CourseDashboard({ preview = false, previewState = "draft" }: { preview?: boolean; previewState?: PreviewState }) {
  const router = useRouter();
  const openedSprint = useRef(preview);
  const [me, setMe] = useState<Me | null>(preview ? previewMe(previewState) : null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<Record<number, string>>({});
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(preview ? previewCourse.slug : null);
  const [assignmentNumber, setAssignmentNumber] = useState(preview && previewState === "needs-fixes" ? 2 : 1);
  const [prInputs, setPrInputs] = useState<Record<number, string>>({});
  const [changing, setChanging] = useState<Record<number, boolean>>({});
  const [phase, setPhase] = useState<Record<number, string>>({});
  const [githubConnected, setGithubConnected] = useState<boolean | null>(preview ? previewState !== "joined" : null);
  const [connectingGithub, setConnectingGithub] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmingChange, setConfirmingChange] = useState(false);
  const [changingSubmission, setChangingSubmission] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [editingConsent, setEditingConsent] = useState(false);

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (preview) return;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/cse115a/me", { credentials: "include" });
      if (response.status === 401) { router.replace("/cse115a/signin"); return; }
      const body = await jsonResponse<Me>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not load your courses.");
      setMe(body);
      setSelectedSlug((previous) => previous && body.courses.some((course) => course.slug === previous)
        ? previous : body.courses[0]?.slug ?? null);
      if (!openedSprint.current && body.courses[0]) {
        openedSprint.current = true;
        const course = body.courses[0];
        setAssignmentNumber(firstOpenSprint(course.assignment_count, (number) =>
          body.assignmentSubmissions.some((item) => item.course_id === course.id && item.assignment_number === number)));
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your courses.");
    } finally {
      setLoading(false);
    }
  }, [router, preview]);

  useEffect(() => { void load(); }, [load]);
  // Grades appear without a reload: poll while any submitted assignment is not yet released.
  const waitingForGrade = Boolean(me?.assignmentSubmissions.some((item) => item.status !== "released"));
  useEffect(() => {
    if (preview || !waitingForGrade) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load({ quiet: true }); }, POLL_MS);
    return () => clearInterval(timer);
  }, [preview, waitingForGrade, load]);
  useEffect(() => {
    if (preview || !me?.courses.length) return;
    void fetch("/api/cse115a/github-status", { credentials: "include" })
      .then((response) => response.json())
      .then((body: { connected?: boolean }) => setGithubConnected(Boolean(body.connected)))
      .catch(() => setGithubConnected(false));
  }, [me?.courses.length, preview]);

  const course = useMemo(() => me?.courses.find((item) => item.slug === selectedSlug) ?? me?.courses[0] ?? null, [me, selectedSlug]);
  const submissions = useMemo(() => (me?.submissions ?? []).filter((item) =>
    item.course_id === course?.id && item.assignment_number === assignmentNumber), [me, course, assignmentNumber]);
  const assignmentSubmission = me?.assignmentSubmissions.find((item) =>
    item.course_id === course?.id && item.assignment_number === assignmentNumber);
  const locked = Boolean(assignmentSubmission);
  const releasedGrades = assignmentSubmission?.status === "released"
    ? (me?.grades ?? []).filter((grade) => grade.assignmentSubmissionId === assignmentSubmission.id) : [];
  // An answer to older wording does not count, so the card asks again.
  const storedConsent = me?.consent.find((item) => item.course_id === course?.id) ?? null;
  const consent = storedConsent?.consent_version === CONSENT_VERSION ? storedConsent : null;

  async function saveConsent(consented: boolean) {
    if (!course) return;
    if (preview) { setEditingConsent(false); return; }
    setSavingConsent(true);
    setError(null);
    try {
      const response = await fetch("/api/cse115a/consent", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug, consented }),
      });
      const body = await jsonResponse<{ consent: Consent }>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not save your choice.");
      setEditingConsent(false);
      await load({ quiet: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your choice.");
    } finally {
      setSavingConsent(false);
    }
  }

  const released = releasedGrades.length > 0;
  // The deadline is enforced but not shown until real dates are set.
  const sprintDueAt = course?.sprints?.find((sprint) => sprint.number === assignmentNumber)?.due_at ?? null;
  const changeAllowed = Boolean(assignmentSubmission) && canChangeSubmission(assignmentSubmission!.status, sprintDueAt);
  const readyCount = submissions.filter((item) => sprintReady(item.validation_json)).length;
  const action = submitAction(submissions.length, readyCount, assignmentNumber);
  const setupDone = Boolean(me?.courses.length) && githubConnected === true;

  // Opening a sprint the student has not started shows its checklist, every time.
  function openSprint(number: number) {
    setAssignmentNumber(number);
    if (!course || !me) return;
    const started = me.assignmentSubmissions.some((item) => item.course_id === course.id && item.assignment_number === number)
      || me.submissions.some((item) => item.course_id === course.id && item.assignment_number === number);
    if (!started) setChecklistOpen(true);
  }

  async function signOut() {
    if (preview) return;
    const supabase = createUserSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/cse115a");
    router.refresh();
  }

  async function joinCourse() {
    if (preview) return;
    if (!joinCode.trim()) { setJoinError("Enter the code from your instructor."); return; }
    setJoining(true);
    setJoinError(null);
    try {
      const response = await fetch("/api/cse115a/join", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ code: joinCode }),
      });
      const body = await jsonResponse<{ course: Course }>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not join this course.");
      setJoinCode("");
      await load();
    } catch (caught) {
      setJoinError(caught instanceof Error ? caught.message : "Could not join this course.");
    } finally {
      setJoining(false);
    }
  }

  async function connectGithub() {
    if (preview) return;
    setConnectingGithub(true);
    setError(null);
    try {
      const supabase = createUserSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      stashOAuthNextPath("/cse115a/dashboard");
      stashOAuthProvider("github");
      const options = { redirectTo: buildOAuthCallbackUrl(getOAuthRedirectOrigin()), scopes: "read:user user:email repo" };
      const result = user?.identities?.some((identity) => identity.provider === "github")
        ? await supabase.auth.signInWithOAuth({ provider: "github", options })
        : await supabase.auth.linkIdentity({ provider: "github", options });
      if (result.error) throw result.error;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect GitHub.");
    } finally {
      setConnectingGithub(false);
    }
  }

  async function savePullRequest(slot: number, mode: "add" | "recheck") {
    if (preview || !course) return;
    const saved = submissions.find((item) => item.task_slot === slot)?.pr_url;
    const prUrl = resolvePullRequestUrl(prInputs[slot] ?? "", saved, mode);
    if (mode === "add" && !parsePullRequestUrl(prUrl)) {
      setSlotError((previous) => ({ ...previous, [slot]: "Enter a full GitHub pull request URL." }));
      return;
    }
    if (!prUrl) return;
    setSlotError((previous) => ({ ...previous, [slot]: "" }));
    setPhase((previous) => ({ ...previous, [slot]: "Checking…" }));
    try {
      const endpoint = `/api/cse115a/assignments/${assignmentNumber}/tasks`;
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug, slot, prUrl }),
      });
      const imported = await jsonResponse<{ submission: Submission }>(response);
      if (!response.ok) throw new Error(imported.error ?? "Could not import the task spec.");
      setChanging((previous) => ({ ...previous, [slot]: false }));
      setPrInputs((previous) => ({ ...previous, [slot]: "" }));
      const shouldAnalyze = mode === "add" || !imported.submission.analysis_result_id;
      if (shouldAnalyze) {
        setPhase((previous) => ({ ...previous, [slot]: "Keep this tab open, this takes about a minute." }));
        const parsed = parsePullRequestUrl(imported.submission.pr_url);
        if (!parsed) throw new Error("Enter a full GitHub pull request URL.");
        const analysis = await runAnalyzeFromUrl(parsed.url, {
          course_id: course.slug, ref: { type: "pr", prNumber: parsed.number },
        });
        if (!analysis.ok) throw new Error(`Task saved, but analysis failed: ${analysis.error}`);
        if (analysis.analysisSkipped) throw new Error(`Task saved, but analysis could not score this PR: ${analysis.analysisSkipped.message}`);
        const linkResponse = await fetch(endpoint, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ courseSlug: course.slug, slot, resultId: analysis.resultId }),
        });
        const linked = await jsonResponse<{ submission: Submission }>(linkResponse);
        if (!linkResponse.ok) throw new Error(linked.error ?? "Task saved, but the analysis result could not be linked.");
      }
      await load();
    } catch (caught) {
      setSlotError((previous) => ({ ...previous, [slot]: caught instanceof Error ? caught.message : "Could not check this pull request." }));
      await load();
    } finally {
      setPhase((previous) => ({ ...previous, [slot]: "" }));
    }
  }

  async function setScrumBoard(slot: number, checked: boolean) {
    if (!course) return;
    if (preview) {
      setMe((current) => current && ({
        ...current,
        submissions: current.submissions.map((item) =>
          item.task_slot === slot && item.assignment_number === assignmentNumber ? { ...item, scrum_board: checked } : item),
      }));
      return;
    }
    setSlotError((previous) => ({ ...previous, [slot]: "" }));
    try {
      const response = await fetch(`/api/cse115a/assignments/${assignmentNumber}/tasks`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug, slot, scrumBoard: checked }),
      });
      const body = await jsonResponse<{ submission: Submission }>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not save the Scrum board confirmation.");
      await load();
    } catch (caught) {
      setSlotError((previous) => ({ ...previous, [slot]: caught instanceof Error ? caught.message : "Could not save the Scrum board confirmation." }));
    }
  }

  async function changeSubmission() {
    if (preview || !course) return;
    setChangingSubmission(true);
    setConfirmingChange(false);
    setError(null);
    try {
      const response = await fetch(`/api/cse115a/assignments/${assignmentNumber}/reopen`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug }),
      });
      const body = await jsonResponse<{ status: string }>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not change this submission.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change this submission.");
    } finally {
      setChangingSubmission(false);
    }
  }

  async function submitAssignment() {
    if (preview || !course) return;
    setSubmittingAssignment(true);
    setConfirmingSubmit(false);
    setError(null);
    try {
      const response = await fetch(`/api/cse115a/assignments/${assignmentNumber}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug }),
      });
      const body = await jsonResponse<{ assignmentSubmission: AssignmentSubmission }>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not submit this sprint.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit this sprint.");
    } finally {
      setSubmittingAssignment(false);
    }
  }

  if (loading && !me) return <p className="py-16 text-center text-slate-600">Loading your course…</p>;

  const courseLabel = course ? `${course.title} · ${course.term}` : null;
  return (
    <div className="w-full max-w-5xl space-y-8 py-8 text-slate-900">
      <Cse115aStudentBar courseLabel={courseLabel} email={me?.email ?? null} onSignOut={() => void signOut()} />
      {preview ? <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Local preview with example data. Sign in and submission actions are disabled here.</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}

      {!setupDone ? (
        <CourseSetup
          email={me?.email ?? null}
          courseLabel={me?.courses.length ? courseLabel : null}
          githubConnected={me?.courses.length ? githubConnected : false}
          joinCode={joinCode}
          onJoinCodeChange={(value) => { setJoinCode(value); setJoinError(null); }}
          onJoin={() => void joinCourse()}
          joining={joining}
          joinError={joinError}
          onConnectGithub={() => void connectGithub()}
          connectingGithub={connectingGithub}
          disabled={preview}
        />
      ) : course ? (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Sprints">
            {Array.from({ length: course.assignment_count }, (_, index) => index + 1).map((number) => {
              const submission = me?.assignmentSubmissions.find((item) => item.course_id === course.id && item.assignment_number === number);
              const label = sprintTabLabel(number, {
                submitted: Boolean(submission),
                released: submission?.status === "released",
                score: submission?.releasedScore ?? null,
              });
              return (
                <button key={number} type="button" onClick={() => openSprint(number)} aria-current={number === assignmentNumber ? "page" : undefined} className={`rounded-lg border px-4 py-2 text-sm font-medium ${number === assignmentNumber ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900"}`}>
                  {label}
                </button>
              );
            })}
          </nav>
          <section className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">Sprint {assignmentNumber}</h1>
                <p className="mt-1 text-sm text-slate-600">
                  {released
                    ? `Graded ${formatWhen(releasedGrades[0]!.releasedAt)} · the average of your two tasks`
                    : assignmentSubmission
                      ? `Submitted ${formatWhen(assignmentSubmission.submitted_at)}. Your grade appears here after instructor review.`
                      : "Add two merged task PRs. We check each one against the submission checklist."}
                </p>
                {released ? <p className="mt-1 text-sm text-slate-600">Questions about this grade? Ask your TA.</p> : null}
                {assignmentSubmission && !released ? <StatusSteps status={assignmentSubmission.status} /> : null}
                {changeAllowed ? (
                  <button type="button" disabled={changingSubmission || preview} onClick={() => setConfirmingChange(true)}
                    className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
                    {changingSubmission ? "Opening…" : "Change submission"}
                  </button>
                ) : null}
              </div>
              {released ? (
                <div className="text-right">
                  <p className="text-xs text-slate-600">Sprint score</p>
                  <p className="text-3xl font-semibold tabular-nums">{formatScore(sprintScore(releasedGrades.map((grade) => grade.total)))}<span className="text-lg text-slate-500"> / 10</span></p>
                </div>
              ) : null}
            </div>
            {!consent || editingConsent ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="consent-heading">
                <h2 id="consent-heading" className="font-semibold">Research use of your tasks</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">{CONSENT_TEXT}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" disabled={savingConsent} onClick={() => void saveConsent(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${consent?.consented ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Yes, include my tasks</button>
                  <button type="button" disabled={savingConsent} onClick={() => void saveConsent(false)} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${consent && !consent.consented ? "bg-slate-900 text-white" : "border border-slate-300"}`}>No, keep them out</button>
                  {editingConsent ? <button type="button" onClick={() => setEditingConsent(false)} className="px-2 text-sm text-slate-600 underline">Cancel</button> : null}
                </div>
              </section>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((slot) => {
                const item = submissions.find((submission) => submission.task_slot === slot);
                const grade = releasedGrades.find((row) => row.slot === slot) ?? null;
                const showInput = !locked && (!item || changing[slot]);
                const lines = item ? processChecklist(item.validation_json, item.facts_json, item.task_id) : [];
                const fixCount = lines.filter((line) => !line.ok).length;
                const prNumber = item?.pr_url.match(/\/pull\/(\d+)/)?.[1];
                const lost = grade ? grade.criteria.filter((row) => row.awarded < row.points) : [];
                return (
                  <div key={slot} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold">Task {slot}{item ? <span className="font-normal text-slate-500"> · {item.task_id}</span> : null}</h2>
                      {grade ? <span className="text-lg font-semibold tabular-nums">{formatScore(grade.total)}<span className="text-sm font-normal text-slate-500"> / 10</span></span>
                        : item && !locked ? <span className={`text-sm font-semibold ${fixCount === 0 ? "text-emerald-700" : "text-amber-700"}`}>{fixCount === 0 ? "Ready" : `${fixCount} to fix`}</span> : null}
                    </div>
                    {item ? (
                      <div className="mt-3 space-y-3 text-sm">
                        <div>
                          <p className="font-semibold">{item.task_spec_json.title}</p>
                          <p className="mt-1 text-slate-600">
                            <a href={`${item.pr_url.split("/pull/")[0]}/blob/HEAD/${item.task_path}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Task file</a>
                            {prNumber ? <> · <a href={item.pr_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">PR #{prNumber}</a></> : null}
                          </p>
                        </div>
                        {grade ? (
                          <div className="rounded-lg bg-slate-50 p-3">
                            <p className="font-medium">{lost.length ? "Where you lost points" : "Full marks on every criterion"}</p>
                            {lost.length ? (
                              <ul className="mt-2 space-y-1.5">
                                {lost.map((row) => (
                                  <li key={row.name}>
                                    <span className="font-medium">{row.name}</span> <span className="tabular-nums text-slate-600">{formatScore(row.awarded)}/{row.points}</span>
                                    {row.note ? <span className="text-slate-600"> · {row.note}</span> : null}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                        {locked ? (
                          <details className="group">
                            <summary className="cursor-pointer list-none text-slate-700 [&::-webkit-details-marker]:hidden">
                              <span aria-hidden className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                              Process checks: {lines.length - fixCount} of {lines.length} {fixCount === 0 ? "✓" : ""}
                            </summary>
                            <ProcessChecklist validation={item.validation_json} facts={item.facts_json} taskId={item.task_id} />
                          </details>
                        ) : <ProcessChecklist validation={item.validation_json} facts={item.facts_json} taskId={item.task_id} />}
                        {locked ? (
                          <p className="text-slate-600">Scrum card: {item.scrum_board ? "confirmed" : "not confirmed"}</p>
                        ) : (
                          <label className="flex items-start gap-2">
                            <input type="checkbox" className="mt-1" checked={item.scrum_board} onChange={(event) => void setScrumBoard(slot, event.target.checked)} />
                            <span>Card is on the team&apos;s Scrum board</span>
                          </label>
                        )}
                        {phase[slot] ? <p className="text-slate-600">{phase[slot]}</p> : null}
                        {item.analysis_result_id ? (
                          <Link href={preview ? "/cse115a/preview/results" : `/cse115a/assignments/${assignmentNumber}/tasks/${slot}/metrics`}
                            className={`inline-flex rounded-lg px-4 py-2 font-semibold ${grade ? "bg-slate-900 text-white" : "border border-slate-300"}`}>
                            {grade ? "See feedback" : "View results"}
                          </Link>
                        ) : null}
                      </div>
                    ) : <p className="mt-3 text-sm text-slate-600">{locked ? "No task was submitted for this slot." : "Paste the merged pull request link."}</p>}
                    {showInput ? (
                      <>
                        <label htmlFor={`pr-${slot}`} className="mt-5 block text-sm font-medium">Merged pull request URL</label>
                        <input id={`pr-${slot}`} type="url" value={prInputs[slot] ?? ""} onChange={(event) => setPrInputs((previous) => ({ ...previous, [slot]: event.target.value }))} placeholder="https://github.com/team/repo/pull/12" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        <button type="button" disabled={preview || Boolean(phase[slot])} onClick={() => void savePullRequest(slot, "add")} className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          {phase[slot] || "Add PR"}
                        </button>
                      </>
                    ) : null}
                    {!locked && item && !showInput ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" disabled={preview || Boolean(phase[slot])} onClick={() => void savePullRequest(slot, "recheck")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Re-check</button>
                        <button type="button" disabled={Boolean(phase[slot])} onClick={() => setChanging((previous) => ({ ...previous, [slot]: true }))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Change PR</button>
                      </div>
                    ) : null}
                    {slotError[slot] ? <p role="alert" className="mt-3 text-sm text-red-700">{slotError[slot]}</p> : null}
                  </div>
                );
              })}
            </div>
            {!assignmentSubmission ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div>
                  <h2 className="font-semibold">Sprint {assignmentNumber}</h2>
                  <p className="mt-1 text-sm text-slate-600">{submitBarText(readyCount)}</p>
                  {action.reason ? <p className="mt-1 text-sm text-slate-600">{action.reason}</p> : null}
                </div>
                <button type="button" disabled={submittingAssignment || action.disabled || preview}
                  onClick={() => setConfirmingSubmit(true)}
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {submittingAssignment ? "Submitting…" : action.label}
                </button>
              </div>
            ) : null}
            <Dialog open={confirmingChange} onOpenChange={setConfirmingChange}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Change your Sprint {assignmentNumber} submission?</DialogTitle>
                  <DialogDescription>This withdraws your submission so you can change your tasks. Until you submit again, nothing is submitted for this sprint.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Keep my submission</DialogClose>
                  <button type="button" onClick={() => void changeSubmission()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Withdraw and edit</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={confirmingSubmit} onOpenChange={setConfirmingSubmit}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit Sprint {assignmentNumber}?</DialogTitle>
                  <DialogDescription>Both tasks lock when you submit. You can still change your submission until the sprint closes.</DialogDescription>
                </DialogHeader>
                <ul className="space-y-2 text-sm">
                  {[...submissions].sort((a, b) => a.task_slot - b.task_slot).map((item) => (
                    <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-medium">Task {item.task_slot}: {item.task_id}</p>
                      <p className="text-slate-600">{item.pr_url}</p>
                    </li>
                  ))}
                </ul>
                <DialogFooter>
                  <DialogClose className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Keep editing</DialogClose>
                  <button type="button" onClick={() => void submitAssignment()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Submit</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>
          {consent && !editingConsent ? (
            <p className="text-sm text-slate-600">Research use: {consent.consented ? "your tasks may be included" : "your tasks are kept out"}. <button type="button" onClick={() => setEditingConsent(true)} className="text-blue-700 underline">Change</button></p>
          ) : null}
          <SprintChecklistDialog open={checklistOpen} onOpenChange={setChecklistOpen} courseSlug={course.slug} sprint={assignmentNumber} />
        </>
      ) : null}
    </div>
  );
}
