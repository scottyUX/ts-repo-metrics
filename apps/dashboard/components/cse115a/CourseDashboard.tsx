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
import { CONSENT_VERSION, currentConsent, type StoredConsent } from "@/lib/cse115a/consent";
import { saveConsentAnswer } from "@/lib/cse115a/consentClient";
import { ResearchConsentQuestion } from "@/components/cse115a/ResearchConsentQuestion";
import { needsCourseInstallPrompt, repoFullNameFromPullRequest } from "@/lib/cse115a/installPrompt";
import { oauthHashError } from "@/lib/cse115a/oauthError";
import { prTaskFileLines } from "@/lib/cse115a/sharedPr";
import { NEED_TASK_FILE_PR_CODE, recheckRequest, savedTaskFilePr, TASK_FILE_PR_BOX, TASK_FILE_PR_CARD_NOTE } from "@/lib/cse115a/taskFilePr";
import {
  BIG_TASK_MIN_HOURS,
  firstOpenSprint,
  linesToFix,
  processChecklist,
  resolvePullRequestUrl,
  sprintReady,
  sprintTabLabel,
  submitAction,
  canChangeSubmission,
  submitBarText,
  oneTaskConfirmText,
  manyTasksConfirmText,
  releasedScoreBasis,
  specEstimateHours,
  type TaskFacts,
} from "@/lib/cse115a/processChecklist";
import { canAddTask, EXTRA_TASK_WARNING, nextTaskSlot, shownTaskSlots, USUAL_TASKS_PER_SPRINT } from "@/lib/cse115a/taskSlots";
import { ProcessChecklist } from "@/components/cse115a/ProcessChecklist";
import { Cse115aStudentBar } from "@/components/cse115a/Cse115aStudentBar";
import { CourseSetup } from "@/components/cse115a/CourseSetup";
import { SprintChecklistDialog } from "@/components/cse115a/SprintChecklistDialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SprintDue = { number: number; due_at: string | null };
// Fall 2026 students submit sprints 2–4. Sprint 1 and Sprint 5 stay in the course record.
const HIDDEN_STUDENT_SPRINTS = new Set([1, 5]);

function studentSprintNumbers(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1).filter((number) => !HIDDEN_STUDENT_SPRINTS.has(number));
}
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
type Consent = StoredConsent;
/** A merged PR that adds several task files: the student chooses one for the slot (one PR, two tasks). */
type TaskFileChoices = { prUrl: string; choices: Array<{ path: string; taskId: string; takenBySlot: number | null }> };
type Me = { email: string; courses: Course[]; submissions: Submission[]; assignmentSubmissions: AssignmentSubmission[]; grades: ReleasedGrade[]; consent: Consent[] };

const POLL_MS = 20_000;

// Fixed so server and client render the same preview.
const PREVIEW_TIME = "2026-09-30T19:12:00Z";

const previewCourse: Course = {
  id: "preview-course", slug: "CSE115A-Fall26", title: "CSE 115A", term: "Fall 2026", assignment_count: 5,
};
const passValidation: Record<string, boolean> = {
  prMerged: true, specCommittedFirst: true,
  prAuthoredByStudent: true, prTitleHasTaskId: true, branchHasTaskId: true, estimateAtLeastTwoHours: true,
};
const noCi: TaskFacts = { ci: { state: "none", failed: 0, total: 0 }, testFileCount: 1, mergeSha: "9f3c2a1", firstCommitSha: "a1b2c3d", firstCommitTaskOnly: true };

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
    return { ...base, assignmentSubmissions: [], submissions: [previewTask(1, 1, { ...passValidation, prTitleHasTaskId: false }, noCi)] };
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
      submissions: [...sprint1Tasks, previewTask(1, 2, { ...passValidation, prTitleHasTaskId: false }, noCi), previewTask(2, 2, passValidation, noCi)],
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
  const [checklistSlot, setChecklistSlot] = useState<number | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(preview ? previewCourse.slug : null);
  const [assignmentNumber, setAssignmentNumber] = useState(2);
  const [prInputs, setPrInputs] = useState<Record<number, string>>({});
  const [taskFileChoices, setTaskFileChoices] = useState<Record<number, TaskFileChoices | null>>({});
  // A merged PR with no task file asks for a second PR that adds it: the work PR's URL, and what is typed there.
  const [taskFilePrBox, setTaskFilePrBox] = useState<Record<number, { prUrl: string } | null>>({});
  const [taskFilePrInputs, setTaskFilePrInputs] = useState<Record<number, string>>({});
  const [changing, setChanging] = useState<Record<number, boolean>>({});
  // Slots opened with Add another task (#412), and the slot whose Remove waits for a second click.
  const [openedSlots, setOpenedSlots] = useState<number[]>([]);
  const [confirmingRemove, setConfirmingRemove] = useState<number | null>(null);
  const [phase, setPhase] = useState<Record<number, string>>({});
  const [githubConnected, setGithubConnected] = useState<boolean | null>(preview ? previewState !== "joined" : null);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [githubInstallUrl, setGithubInstallUrl] = useState<string | null>(null);
  const [installPromptOpen, setInstallPromptOpen] = useState(false);
  const [uninstalledRepos, setUninstalledRepos] = useState<string[]>([]);
  const [connectingGithub, setConnectingGithub] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
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
        const visible = studentSprintNumbers(course.assignment_count);
        setAssignmentNumber(visible.find((number) =>
          !body.assignmentSubmissions.some((item) => item.course_id === course.id && item.assignment_number === number))
          ?? visible[visible.length - 1]
          ?? firstOpenSprint(course.assignment_count, () => true));
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your courses.");
    } finally {
      setLoading(false);
    }
  }, [router, preview]);

  useEffect(() => { void load(); }, [load]);
  // A failed GitHub link comes back as #error=... in the URL; show it and clean the URL.
  useEffect(() => {
    if (preview) return;
    const message = oauthHashError(window.location.hash);
    if (!message) return;
    setGithubError(message);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [preview]);
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
      .then((body: { connected?: boolean; login?: string | null; installUrl?: string | null }) => {
        setGithubConnected(Boolean(body.connected));
        setGithubLogin(body.login ?? null);
        setGithubInstallUrl(body.installUrl ?? null);
      })
      .catch(() => setGithubConnected(false));
  }, [me?.courses.length, preview]);

  const course = useMemo(() => me?.courses.find((item) => item.slug === selectedSlug) ?? me?.courses[0] ?? null, [me, selectedSlug]);
  const submissions = useMemo(() => (me?.submissions ?? []).filter((item) =>
    item.course_id === course?.id && item.assignment_number === assignmentNumber), [me, course, assignmentNumber]);
  const assignmentSubmission = me?.assignmentSubmissions.find((item) =>
    item.course_id === course?.id && item.assignment_number === assignmentNumber);
  const locked = Boolean(assignmentSubmission);
  const offerInstall = Boolean(githubInstallUrl) && !locked && needsCourseInstallPrompt({ uninstalledRepos });
  const installTarget = uninstalledRepos.length > 1 ? "those repositories" : "that repository";
  const handleDismissInstallPrompt = () => {
    setInstallPromptOpen(false);
  };
  const rememberInstallResult = (url: string, installed: boolean) => {
    const repo = repoFullNameFromPullRequest(url);
    if (!repo) return;
    setUninstalledRepos((previous) => {
      if (installed) return previous.includes(repo) ? previous.filter((item) => item !== repo) : previous;
      return previous.includes(repo) ? previous : [...previous, repo];
    });
    if (!installed) setInstallPromptOpen(true);
  };
  const releasedGrades = assignmentSubmission?.status === "released"
    ? (me?.grades ?? []).filter((grade) => grade.assignmentSubmissionId === assignmentSubmission.id) : [];
  // An answer to older wording does not count, so the card asks again.
  const consent = currentConsent(me?.consent, course?.id);

  async function saveConsent(consented: boolean) {
    if (!course) return;
    if (preview) { setEditingConsent(false); return; }
    setSavingConsent(true);
    setError(null);
    try {
      await saveConsentAnswer(course.slug, consented);
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
  const readyCount = submissions.filter((item) => sprintReady(item.validation_json, item.facts_json)).length;
  const action = submitAction(submissions.length, readyCount, assignmentNumber);
  // One task added: its saved estimate decides the big-task warning, which never blocks Submit (#348).
  const oneTaskHours = submissions.length === 1 ? specEstimateHours(submissions[0]!.task_spec_json) : null;
  // A task whose PR adds more than one task file says so on its card, from the count recorded at import.
  const prTasks = submissions.map((item) => ({
    slot: item.task_slot, taskId: item.task_id, prUrl: item.pr_url, taskPath: item.task_path, prTaskFiles: item.facts_json?.prTaskFiles ?? null,
  }));
  const setupDone = Boolean(me?.courses.length) && githubConnected === true;
  // Task 1 and Task 2 always; Task 3 and on when saved or opened with Add another task (#412).
  const slots = shownTaskSlots(submissions.map((item) => item.task_slot), openedSlots, locked);
  const addSlot = canAddTask(slots, locked) ? nextTaskSlot(slots) : null;

  // Typed URLs and messages belong to the sprint they were typed in.
  function openSprint(number: number) {
    setAssignmentNumber(number);
    setPrInputs({});
    setTaskFileChoices({});
    setTaskFilePrBox({});
    setTaskFilePrInputs({});
    setSlotError({});
    setChanging({});
    setOpenedSlots([]);
    setConfirmingRemove(null);
  }

  /** Change PR starts over with an empty form. */
  function startChangingPr(slot: number) {
    setChanging((previous) => ({ ...previous, [slot]: true }));
    setPrInputs((previous) => ({ ...previous, [slot]: "" }));
    setTaskFileChoices((previous) => ({ ...previous, [slot]: null }));
    setTaskFilePrBox((previous) => ({ ...previous, [slot]: null }));
    setTaskFilePrInputs((previous) => ({ ...previous, [slot]: "" }));
    setSlotError((previous) => ({ ...previous, [slot]: "" }));
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
    setGithubError(null);
    try {
      const supabase = createUserSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      stashOAuthNextPath("/cse115a/dashboard");
      stashOAuthProvider("github");
      // GitHub only confirms who the student is here; repository access comes from the course GitHub App.
      const options = { redirectTo: buildOAuthCallbackUrl(getOAuthRedirectOrigin()) };
      const result = user?.identities?.some((identity) => identity.provider === "github")
        ? await supabase.auth.signInWithOAuth({ provider: "github", options })
        : await supabase.auth.linkIdentity({ provider: "github", options });
      if (result.error) throw result.error;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not connect GitHub.";
      setGithubError(message);
      setError(message);
    } finally {
      setConnectingGithub(false);
    }
  }

  /**
   * `chosen`: the task file picked from a merged PR that adds several, or the task-file PR paired with a merged PR
   * that adds none, with that PR's URL.
   */
  async function savePullRequest(slot: number, mode: "add" | "recheck", chosen?: { prUrl: string; taskPath?: string; taskFilePrUrl?: string }) {
    if (preview || !course) return;
    const savedTask = submissions.find((item) => item.task_slot === slot);
    const prUrl = chosen?.prUrl ?? resolvePullRequestUrl(prInputs[slot] ?? "", savedTask?.pr_url, mode);
    // Re-check keeps the saved task file, so a PR with two task files stays on this slot's file, and re-imports a
    // pair with its saved task-file PR.
    const saved = mode === "recheck" && savedTask ? recheckRequest(savedTask) : null;
    const taskPath = chosen?.taskPath ?? saved?.taskPath;
    const taskFilePrUrl = chosen?.taskFilePrUrl ?? saved?.taskFilePrUrl;
    if (mode === "add" && !parsePullRequestUrl(prUrl)) {
      setSlotError((previous) => ({ ...previous, [slot]: "Enter a full GitHub pull request URL." }));
      return;
    }
    // An empty second box; any other URL is checked by the server, which says what is wrong with it.
    if (chosen && "taskFilePrUrl" in chosen && !chosen.taskFilePrUrl) {
      setSlotError((previous) => ({ ...previous, [slot]: "Enter a full GitHub pull request URL." }));
      return;
    }
    if (!prUrl) return;
    setSlotError((previous) => ({ ...previous, [slot]: "" }));
    setTaskFileChoices((previous) => ({ ...previous, [slot]: null }));
    // The task-file box stays open while its own step is checked, so its errors show under it.
    if (!chosen?.taskFilePrUrl) setTaskFilePrBox((previous) => ({ ...previous, [slot]: null }));
    setPhase((previous) => ({ ...previous, [slot]: "Checking…" }));
    try {
      const endpoint = `/api/cse115a/assignments/${assignmentNumber}/tasks`;
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug, slot, prUrl, ...(taskPath ? { taskPath } : {}), ...(taskFilePrUrl ? { taskFilePrUrl } : {}) }),
      });
      const imported = await jsonResponse<{ submission: Submission; code?: string; choices?: TaskFileChoices["choices"] }>(response);
      if (!response.ok) {
        if (imported.code === "choose_task_file" && imported.choices) {
          setTaskFileChoices((previous) => ({ ...previous, [slot]: { prUrl, choices: imported.choices! } }));
          return;
        }
        if (imported.code === NEED_TASK_FILE_PR_CODE) {
          setTaskFilePrBox((previous) => ({ ...previous, [slot]: { prUrl } }));
          return;
        }
        if (imported.code === "github_app_not_installed") rememberInstallResult(prUrl, false);
        throw new Error(imported.error ?? "Could not import the task spec.");
      }
      rememberInstallResult(imported.submission.pr_url, true);
      setChanging((previous) => ({ ...previous, [slot]: false }));
      setPrInputs((previous) => ({ ...previous, [slot]: "" }));
      setTaskFilePrBox((previous) => ({ ...previous, [slot]: null }));
      setTaskFilePrInputs((previous) => ({ ...previous, [slot]: "" }));
      // Show the saved PR now; the analysis below takes about a minute.
      await load({ quiet: true });
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

  /** Removes the task in a slot before the sprint is submitted (#412). Its card stays if it is a usual slot. */
  async function removeTask(slot: number) {
    setConfirmingRemove(null);
    if (preview || !course) return;
    setSlotError((previous) => ({ ...previous, [slot]: "" }));
    setPhase((previous) => ({ ...previous, [slot]: "Removing…" }));
    try {
      const response = await fetch(`/api/cse115a/assignments/${assignmentNumber}/tasks`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug, slot }),
      });
      const body = await jsonResponse<{ removed: { slot: number } }>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not remove this task.");
      setChanging((previous) => ({ ...previous, [slot]: false }));
      setPrInputs((previous) => ({ ...previous, [slot]: "" }));
      setTaskFileChoices((previous) => ({ ...previous, [slot]: null }));
      setTaskFilePrBox((previous) => ({ ...previous, [slot]: null }));
      setTaskFilePrInputs((previous) => ({ ...previous, [slot]: "" }));
      setOpenedSlots((previous) => previous.filter((item) => item !== slot));
      await load();
    } catch (caught) {
      setSlotError((previous) => ({ ...previous, [slot]: caught instanceof Error ? caught.message : "Could not remove this task." }));
    } finally {
      setPhase((previous) => ({ ...previous, [slot]: "" }));
    }
  }

  function showScrumBoard(slot: number, checked: boolean) {
    setMe((current) => current && ({
      ...current,
      submissions: current.submissions.map((item) =>
        item.task_slot === slot && item.assignment_number === assignmentNumber ? { ...item, scrum_board: checked } : item),
    }));
  }

  async function setScrumBoard(slot: number, checked: boolean) {
    if (!course) return;
    // Tick the box right away; the save catches up, and a failure puts it back (#257).
    showScrumBoard(slot, checked);
    if (preview) return;
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
      showScrumBoard(slot, !checked);
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

  // Keep the loading line up until the GitHub status is known, so a joined student
  // never sees the setup card flash on refresh (#297).
  const checkingGithub = Boolean(me?.courses.length) && githubConnected === null;
  if ((loading && !me) || checkingGithub) return <p className="py-16 text-center text-slate-600">Loading your course…</p>;

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
          githubLogin={githubLogin}
          githubInstallUrl={githubInstallUrl}
          joinCode={joinCode}
          onJoinCodeChange={(value) => { setJoinCode(value); setJoinError(null); }}
          onJoin={() => void joinCourse()}
          joining={joining}
          joinError={joinError}
          onConnectGithub={() => void connectGithub()}
          connectingGithub={connectingGithub}
          githubError={githubError}
          disabled={preview}
        />
      ) : course ? (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Sprints">
            {studentSprintNumbers(course.assignment_count).map((number) => {
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
                    ? `Graded ${formatWhen(releasedGrades[0]!.releasedAt)} · ${releasedScoreBasis(releasedGrades.length)}`
                    : assignmentSubmission
                      ? `Submitted ${formatWhen(assignmentSubmission.submitted_at)}. Your grade appears here after instructor review.`
                      : `Add two merged task PRs, or one big task (estimate ${BIG_TASK_MIN_HOURS} hours or more). We check each one against its checklist.`}
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
              <ResearchConsentQuestion
                headingId="consent-heading"
                consent={consent}
                saving={savingConsent}
                onAnswer={(consented) => void saveConsent(consented)}
                onCancel={editingConsent ? () => setEditingConsent(false) : undefined}
              />
            ) : null}
            {githubInstallUrl && !locked ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-900 bg-slate-900 px-5 py-4 text-white">
                <p className="max-w-2xl text-sm">
                  {offerInstall
                    ? `The course GitHub App cannot read ${uninstalledRepos.join(", ")}. Ask the repository owner (or an owner of its organization) to install it on ${installTarget}, then add the pull request.`
                    : "The repository owner installs the course GitHub App once, on the team repository; teammates don't install anything. The same button adds it to another repository, or removes it."}
                </p>
                <a href={githubInstallUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900">{offerInstall ? "Install the GitHub App" : "Install or manage"}</a>
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              {slots.map((slot) => {
                const item = submissions.find((submission) => submission.task_slot === slot);
                const grade = releasedGrades.find((row) => row.slot === slot) ?? null;
                const showInput = !locked && (!item || changing[slot]);
                const lines = item ? processChecklist(item.validation_json, item.facts_json) : [];
                const fixCount = linesToFix(lines).length;
                const prNumber = item?.pr_url.match(/\/pull\/(\d+)/)?.[1];
                const lost = grade ? grade.criteria.filter((row) => row.awarded < row.points) : [];
                const choice = taskFileChoices[slot] ?? null;
                const pairBox = taskFilePrBox[slot] ?? null;
                const pair = item ? savedTaskFilePr(item.facts_json) : null;
                const prTask = prTasks.find((task) => task.slot === slot);
                const prLines = prTask ? prTaskFileLines(prTasks, prTask, "student") : [];
                return (
                  <div key={slot} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold">Task {slot}{item ? <span className="font-normal text-slate-500"> · {item.task_id}</span> : null} <button type="button" onClick={() => setChecklistSlot(slot)} className="ml-2 text-sm font-normal text-blue-700 underline">Checklist</button></h2>
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
                          {pair && prNumber ? (
                            <>
                              <p className="mt-1 text-slate-600">
                                Task file from <a href={pair.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">PR #{pair.number}</a>
                                {" · "}work from <a href={item.pr_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">PR #{prNumber}</a>
                              </p>
                              <p className="mt-1 text-slate-600">{TASK_FILE_PR_CARD_NOTE}</p>
                            </>
                          ) : null}
                          {prLines.map((line) => <p key={line} className="mt-1 text-slate-600">{line}</p>)}
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
                            <ProcessChecklist validation={item.validation_json} facts={item.facts_json} />
                          </details>
                        ) : <ProcessChecklist validation={item.validation_json} facts={item.facts_json} />}
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
                        {item ? <p className="mt-1 text-sm text-slate-600">Paste a pull request from this repository or a different one.</p> : null}
                        <input id={`pr-${slot}`} type="url" value={prInputs[slot] ?? ""} onChange={(event) => { setPrInputs((previous) => ({ ...previous, [slot]: event.target.value })); setTaskFileChoices((previous) => ({ ...previous, [slot]: null })); setTaskFilePrBox((previous) => ({ ...previous, [slot]: null })); }} placeholder="https://github.com/team/repo/pull/12" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        <button type="button" disabled={preview || Boolean(phase[slot])} onClick={() => void savePullRequest(slot, "add")} className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          {phase[slot] || "Add PR"}
                        </button>
                        {choice ? (
                          <fieldset className="mt-4 rounded-lg border border-slate-300 p-3 text-sm">
                            <legend className="px-1 font-semibold">Which task file from this merged PR is Task {slot}?</legend>
                            <p className="text-slate-600">Each task file in this PR can be one of your tasks. Add the same PR in your other task and choose the other file.</p>
                            <div className="mt-3 flex flex-col gap-2">
                              {choice.choices.map((option) => (
                                <button key={option.path} type="button" disabled={preview || Boolean(phase[slot]) || option.takenBySlot !== null}
                                  onClick={() => void savePullRequest(slot, "add", { prUrl: choice.prUrl, taskPath: option.path })}
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50">
                                  <span className="font-medium">{option.taskId}</span>
                                  <span className="text-slate-600"> · {option.path.split("/").pop()}</span>
                                  {option.takenBySlot !== null ? <span className="text-slate-600"> · Taken: already your Task {option.takenBySlot}</span> : null}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                        ) : null}
                        {pairBox ? (
                          <fieldset className="mt-4 rounded-lg border border-slate-300 p-3 text-sm">
                            <legend className="px-1 font-semibold">{TASK_FILE_PR_BOX.heading}</legend>
                            <p className="text-slate-600">{TASK_FILE_PR_BOX.text(assignmentNumber)}</p>
                            <label htmlFor={`task-file-pr-${slot}`} className="mt-3 block font-medium">{TASK_FILE_PR_BOX.label}</label>
                            <input id={`task-file-pr-${slot}`} type="url" value={taskFilePrInputs[slot] ?? ""} onChange={(event) => setTaskFilePrInputs((previous) => ({ ...previous, [slot]: event.target.value }))} placeholder="https://github.com/team/repo/pull/13" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <button type="button" disabled={preview || Boolean(phase[slot])}
                              onClick={() => void savePullRequest(slot, "add", { prUrl: pairBox.prUrl, taskFilePrUrl: (taskFilePrInputs[slot] ?? "").trim() })}
                              className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                              {phase[slot] || TASK_FILE_PR_BOX.button}
                            </button>
                          </fieldset>
                        ) : null}
                      </>
                    ) : null}
                    {!locked && item && !showInput ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" disabled={preview || Boolean(phase[slot])} onClick={() => void savePullRequest(slot, "recheck")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Re-check</button>
                        <button type="button" disabled={Boolean(phase[slot])} onClick={() => startChangingPr(slot)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Change PR</button>
                        {confirmingRemove === slot ? (
                          <>
                            <button type="button" disabled={preview || Boolean(phase[slot])} onClick={() => void removeTask(slot)} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Remove Task {slot}</button>
                            <button type="button" onClick={() => setConfirmingRemove(null)} className="px-2 text-sm text-slate-600 underline">Keep it</button>
                          </>
                        ) : (
                          <button type="button" disabled={Boolean(phase[slot])} onClick={() => setConfirmingRemove(slot)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Remove</button>
                        )}
                      </div>
                    ) : null}
                    {slotError[slot] ? <p role="alert" className="mt-3 whitespace-pre-line text-sm text-red-700">{slotError[slot]}</p> : null}
                  </div>
                );
              })}
            </div>
            {addSlot !== null ? (
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                <button type="button" onClick={() => setOpenedSlots((previous) => [...previous, addSlot])}
                  className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
                  Add another task
                </button>
                <p className="max-w-2xl text-sm text-slate-600">{EXTRA_TASK_WARNING}</p>
              </div>
            ) : null}
            {!assignmentSubmission ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div>
                  <h2 className="font-semibold">Sprint {assignmentNumber}</h2>
                  <p className="mt-1 text-sm text-slate-600">{submitBarText(submissions.length, readyCount, oneTaskHours)}</p>
                  {action.reason ? <p className="mt-1 text-sm text-slate-600">{action.reason}</p> : null}
                </div>
                <button type="button" disabled={submittingAssignment || action.disabled || preview}
                  onClick={() => setConfirmingSubmit(true)}
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {submittingAssignment ? "Submitting…" : action.label}
                </button>
              </div>
            ) : null}
            <Dialog open={installPromptOpen} onOpenChange={(open) => { if (!open) handleDismissInstallPrompt(); }}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Install the course GitHub App</DialogTitle>
                  <DialogDescription>
                    The course GitHub App cannot read {uninstalledRepos.join(", ") || "this repository"}. Ask the repository owner (or an owner of its organization) to install it on {installTarget}. Only they can. It can only read the repository, and it never changes the code.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <button type="button" onClick={handleDismissInstallPrompt} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Not now</button>
                  {githubInstallUrl ? (
                    <a href={githubInstallUrl} target="_blank" rel="noreferrer" onClick={handleDismissInstallPrompt} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Install the GitHub App</a>
                  ) : null}
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                  <DialogDescription>
                    {submissions.length === 1
                      ? oneTaskConfirmText(oneTaskHours)
                      : manyTasksConfirmText(submissions.length)}
                  </DialogDescription>
                </DialogHeader>
                {submissions.length > USUAL_TASKS_PER_SPRINT ? <p className="text-sm text-slate-700">{EXTRA_TASK_WARNING}</p> : null}
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
            <p className="text-sm text-slate-600">Research use: {consent.consented ? "you agreed" : "you did not agree"}. <button type="button" onClick={() => setEditingConsent(true)} className="text-blue-700 underline">Change</button></p>
          ) : null}
          <SprintChecklistDialog open={checklistSlot !== null} onOpenChange={(open) => { if (!open) setChecklistSlot(null); }} courseSlug={course.slug} sprint={assignmentNumber} slot={checklistSlot ?? 1} />
        </>
      ) : null}
    </div>
  );
}
