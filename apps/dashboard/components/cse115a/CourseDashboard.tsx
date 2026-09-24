"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildOAuthCallbackUrl, getOAuthRedirectOrigin, stashOAuthNextPath, stashOAuthProvider } from "@/lib/oauthRedirectOrigin";
import { parsePullRequestUrl, type TaskSpec } from "@/lib/cse115a/taskSpec";
import { runAnalyzeFromUrl } from "@/lib/runAnalyze";

type Course = { id: string; slug: string; title: string; term: string; assignment_count: number };
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
  analysis_result_id: string | null;
  updated_at: string;
};
type AssignmentSubmission = { course_id: string; assignment_number: number; submitted_at: string };
type Me = { email: string; courses: Course[]; submissions: Submission[]; assignmentSubmissions: AssignmentSubmission[] };

const previewCourse: Course = { id: "preview-course", slug: "CSE115A-Fall26", title: "CSE 115A", term: "Fall 2026", assignment_count: 5 };
const previewMe: Me = {
  email: "student@ucsc.edu",
  courses: [previewCourse],
  submissions: [{
    id: "preview-task", course_id: previewCourse.id, assignment_number: 1, task_slot: 1,
    task_id: "task-01", pr_url: "https://github.com/example/team-project/pull/12",
    task_path: "docs/tasks/sprint-1/task-01.md",
    task_spec_json: { title: "Example task: improve route handling", description: "Define the behavior, acceptance criteria, and tests before implementation." } as TaskSpec,
    validation_json: { prMerged: true, specCommittedFirst: true, baseTagPushed: false },
    analysis_result_id: "preview-result", updated_at: new Date().toISOString(),
  }],
  assignmentSubmissions: [],
};

const CHECK_LABELS: Record<string, string> = {
  prMerged: "PR is merged",
  prAuthoredByStudent: "PR was opened by your GitHub account",
  prTitleHasTaskId: "PR title contains the task ID",
  branchHasTaskId: "Branch name contains the task ID",
  baseTagPushed: "Base tag is pushed",
  specCommittedFirst: "The task spec is the first and only file in its commit",
  doneTagOnMergeCommit: "Done tag points to the merge commit",
  estimateAtLeastTwoHours: "Estimate is at least two hours",
};

async function jsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  return response.json() as Promise<T & { error?: string }>;
}

export function CourseDashboard({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(preview ? previewMe : null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(preview ? previewCourse.slug : null);
  const [assignmentNumber, setAssignmentNumber] = useState(1);
  const [prInputs, setPrInputs] = useState<Record<number, string>>({});
  const [phase, setPhase] = useState<Record<number, string>>({});
  const [githubConnected, setGithubConnected] = useState<boolean | null>(preview ? true : null);
  const [connectingGithub, setConnectingGithub] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);

  const load = useCallback(async () => {
    if (preview) return;
    setLoading(true);
    try {
      const response = await fetch("/api/cse115a/me", { credentials: "include" });
      if (response.status === 401) { router.replace("/cse115a/signin"); return; }
      const body = await jsonResponse<Me>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not load your courses.");
      setMe(body);
      setSelectedSlug((previous) => previous && body.courses.some((course) => course.slug === previous)
        ? previous : body.courses[0]?.slug ?? null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your courses.");
    } finally {
      setLoading(false);
    }
  }, [router, preview]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (preview || !me?.courses.length) return;
    void fetch("/api/cse115a/github-status", { credentials: "include" })
      .then((response) => response.json())
      .then((body: { connected?: boolean }) => setGithubConnected(Boolean(body.connected)))
      .catch(() => setGithubConnected(false));
  }, [me?.courses.length, preview]);

  const course = useMemo(() => me?.courses.find((item) => item.slug === selectedSlug) ?? null, [me, selectedSlug]);
  const submissions = useMemo(() => (me?.submissions ?? []).filter((item) =>
    item.course_id === course?.id && item.assignment_number === assignmentNumber), [me, course, assignmentNumber]);
  const assignmentSubmission = me?.assignmentSubmissions.find((item) =>
    item.course_id === course?.id && item.assignment_number === assignmentNumber);

  async function joinCourse(event: React.FormEvent) {
    event.preventDefault();
    if (preview) return;
    setJoining(true);
    setError(null);
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
      setError(caught instanceof Error ? caught.message : "Could not join this course.");
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

  async function submitTask(slot: number) {
    if (preview) return;
    if (!course) return;
    const prUrl = prInputs[slot]?.trim() ?? submissions.find((item) => item.task_slot === slot)?.pr_url ?? "";
    const parsed = parsePullRequestUrl(prUrl);
    if (!parsed) { setError("Enter a full GitHub pull request URL."); return; }
    setError(null);
    setPhase((previous) => ({ ...previous, [slot]: "Importing task spec…" }));
    try {
      const endpoint = `/api/cse115a/assignments/${assignmentNumber}/tasks`;
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug, slot, prUrl }),
      });
      const imported = await jsonResponse<{ submission: Submission }>(response);
      if (!response.ok) throw new Error(imported.error ?? "Could not import the task spec.");
      await load();
      setPhase((previous) => ({ ...previous, [slot]: "Analyzing changed files…" }));
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
      setPrInputs((previous) => ({ ...previous, [slot]: "" }));
      await load();
      router.push(`/cse115a/assignments/${assignmentNumber}/tasks/${slot}/metrics`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the task.");
    } finally {
      setPhase((previous) => ({ ...previous, [slot]: "" }));
    }
  }

  async function submitAssignment() {
    if (preview) return;
    if (!course) return;
    setSubmittingAssignment(true);
    setError(null);
    try {
      const response = await fetch(`/api/cse115a/assignments/${assignmentNumber}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ courseSlug: course.slug }),
      });
      const body = await jsonResponse<{ assignmentSubmission: AssignmentSubmission }>(response);
      if (!response.ok) throw new Error(body.error ?? "Could not submit this assignment.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit this assignment.");
    } finally {
      setSubmittingAssignment(false);
    }
  }

  if (loading && !me) return <p className="py-16 text-center text-muted-foreground">Loading your course…</p>;
  return (
    <div className="w-full max-w-5xl space-y-8 py-8 text-foreground">
      <div>
        {preview ? <p className="mb-4 rounded-lg border border-border bg-muted p-3 text-sm text-foreground">Local preview with example data. Sign in and submission actions are disabled here.</p> : null}
        <p className="text-sm font-medium text-primary">{me?.email}</p>
        <h1 className="mt-2 text-3xl font-bold">Your assignments</h1>
        <p className="mt-2 text-muted-foreground">Submit two different merged task pull requests for each assignment. We import the task descriptions from your repository.</p>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}

      {!me?.courses.length ? (
        <section className="max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Join your course</h2>
          <p className="mt-2 text-sm text-muted-foreground">Enter the quarter code provided by your instructor. You only need to do this once.</p>
          <form onSubmit={(event) => void joinCourse(event)} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="course-code" className="sr-only">Course code</label>
            <input id="course-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Course code" autoComplete="off" required className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-foreground uppercase" />
            <button disabled={joining} className="rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-50">{joining ? "Joining…" : "Join course"}</button>
          </form>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Current course</p>
              <h2 className="mt-1 text-lg font-semibold">{course?.title} · {course?.term}</h2>
            </div>
            {me.courses.length > 1 ? (
              <select aria-label="Course" value={selectedSlug ?? ""} onChange={(event) => { setSelectedSlug(event.target.value); setAssignmentNumber(1); }} className="rounded-lg border border-input bg-background px-3 py-2 text-foreground">
                {me.courses.map((item) => <option key={item.id} value={item.slug}>{item.title} · {item.term}</option>)}
              </select>
            ) : null}
          </div>

          {githubConnected === false ? (
            <section className="rounded-2xl border border-border bg-muted p-5">
              <h2 className="font-semibold">Connect GitHub to submit tasks</h2>
              <p className="mt-1 text-sm text-foreground">Google confirms your UCSC identity. GitHub lets Repo Metrics read your team repository and merged PRs.</p>
              <button type="button" disabled={connectingGithub} onClick={() => void connectGithub()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {connectingGithub ? "Opening GitHub…" : "Connect GitHub"}
              </button>
            </section>
          ) : null}

          {course ? (
            <>
              <nav className="flex flex-wrap gap-2" aria-label="Assignments">
                {Array.from({ length: course.assignment_count }, (_, index) => index + 1).map((number) => {
                  const complete = (me.submissions ?? []).filter((item) => item.course_id === course.id && item.assignment_number === number && item.analysis_result_id).length;
                  return <button key={number} type="button" onClick={() => setAssignmentNumber(number)} className={`rounded-lg border px-4 py-2 text-sm font-medium ${number === assignmentNumber ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground"}`}>
                    Assignment {number} <span className="ml-1 opacity-70">{complete}/2</span>
                  </button>;
                })}
              </nav>
              <section className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold">Assignment {assignmentNumber}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Paste one merged PR link per task. Its task file must be in <code>docs/tasks/sprint-{assignmentNumber}/</code>.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {[1, 2].map((slot) => {
                    const item = submissions.find((submission) => submission.task_slot === slot);
                    return (
                      <div key={slot} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <h3 className="text-lg font-semibold">Task {slot}</h3>
                        {item ? (
                          <div className="mt-4 space-y-2 text-sm">
                            <p className="font-semibold text-foreground">{item.task_id}: {item.task_spec_json.title}</p>
                            <p className="line-clamp-3 text-muted-foreground">{item.task_spec_json.description}</p>
                            <a href={item.pr_url} target="_blank" rel="noopener noreferrer" className="block text-primary underline">Merged PR #{item.pr_url.split("/").pop()}</a>
                            <p className={item.analysis_result_id ? "text-primary" : "text-muted-foreground"}>{item.analysis_result_id ? "Submitted and analyzed" : "Task imported · analysis pending"}</p>
                            {item.analysis_result_id ? <Link href={preview ? "/cse115a/preview/results" : `/cse115a/assignments/${assignmentNumber}/tasks/${slot}/metrics`} className="inline-flex rounded-lg border border-primary px-4 py-2 font-semibold text-primary hover:bg-accent">View results</Link> : null}
                            {Object.entries(item.validation_json).filter(([, ok]) => !ok).length ? (
                              <div className="rounded-lg bg-muted p-3 text-foreground">
                                <p className="font-medium">Checks to review</p>
                                <ul className="mt-1 list-inside list-disc">
                                  {Object.entries(item.validation_json).filter(([, ok]) => !ok).map(([key]) => <li key={key}>{CHECK_LABELS[key] ?? key}</li>)}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : <p className="mt-3 text-sm text-muted-foreground">No pull request submitted yet.</p>}
                        <label htmlFor={`pr-${slot}`} className="mt-5 block text-sm font-medium">Merged pull request URL</label>
                        <input id={`pr-${slot}`} type="url" value={prInputs[slot] ?? ""} onChange={(event) => setPrInputs((previous) => ({ ...previous, [slot]: event.target.value }))} placeholder="https://github.com/team/repo/pull/12" className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                        <button type="button" disabled={preview || Boolean(phase[slot]) || githubConnected === false} onClick={() => void submitTask(slot)} className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                          {phase[slot] || (item?.analysis_result_id ? "Replace task PR" : item ? "Retry analysis" : "Submit task")}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
                  <div>
                    <h3 className="font-semibold">Assignment {assignmentNumber} submission</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {assignmentSubmission
                        ? `Submitted ${new Date(assignmentSubmission.submitted_at).toLocaleString()}`
                        : `${submissions.filter((item) => item.analysis_result_id).length} of 2 tasks analyzed`}
                    </p>
                  </div>
                  <button type="button" disabled={preview || submittingAssignment || submissions.filter((item) => item.analysis_result_id).length !== 2}
                    onClick={() => void submitAssignment()}
                    className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                    {submittingAssignment ? "Submitting…" : assignmentSubmission ? "Resubmit assignment" : `Submit Assignment ${assignmentNumber}`}
                  </button>
                </div>
              </section>
            </>
          ) : null}
          <p className="text-sm text-muted-foreground">Your course record is saved here. Follow your instructor’s instructions for any Canvas submission.</p>
        </>
      )}
    </div>
  );
}
