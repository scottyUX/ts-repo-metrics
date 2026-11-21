"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { currentConsent, type StoredConsent } from "@/lib/cse115a/consent";
import { saveConsentAnswer } from "@/lib/cse115a/consentClient";
import { CSE115A_CONSENT_PATH, CSE115A_DASHBOARD_PATH } from "@/lib/cse115a/signInReturn";
import { ResearchConsentQuestion } from "@/components/cse115a/ResearchConsentQuestion";
import { UcscGoogleButton } from "@/components/cse115a/UcscGoogleButton";

type ConsentCourse = { id: string; slug: string; title: string; term: string };

export type ConsentPageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "signed-out" }
  | { kind: "not-enrolled" }
  | { kind: "enrolled"; courses: ConsentCourse[]; consent: StoredConsent[] };

/** What the page shows for an answer from GET /api/cse115a/me (status and body). */
export function consentPageState(status: number, body: { courses?: ConsentCourse[]; consent?: StoredConsent[]; error?: string } | null): ConsentPageState {
  if (status === 401) return { kind: "signed-out" };
  if (status < 200 || status >= 300 || !body) return { kind: "error", message: body?.error ?? "Could not load your courses." };
  if (!body.courses?.length) return { kind: "not-enrolled" };
  return { kind: "enrolled", courses: body.courses, consent: body.consent ?? [] };
}

const BACK_LINK = <Link href={CSE115A_DASHBOARD_PATH} className="text-sm font-medium underline">Back to your course</Link>;

export function ConsentPageView({
  state,
  saving = {},
  saved = {},
  error = null,
  onAnswer = () => {},
}: {
  state: ConsentPageState;
  saving?: Record<string, boolean>;
  saved?: Record<string, boolean>;
  error?: string | null;
  onAnswer?: (course: ConsentCourse, consented: boolean) => void;
}) {
  if (state.kind === "loading") return <p className="py-16 text-center text-slate-600">Loading…</p>;
  return (
    <div className="w-full max-w-5xl space-y-6 py-8 text-slate-900">
      <header className="space-y-2">
        {state.kind === "enrolled" || state.kind === "not-enrolled" ? <p>{BACK_LINK}</p> : null}
        <h1 className="text-3xl font-bold">Research consent</h1>
      </header>
      {state.kind === "error" ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</p> : null}
      {state.kind === "signed-out" ? (
        <div className="max-w-md space-y-4">
          <p className="text-sm text-slate-600">Sign in with your @ucsc.edu account to see the research question for your course. You come back to this page after signing in.</p>
          <UcscGoogleButton fullWidth returnTo={CSE115A_CONSENT_PATH} />
        </div>
      ) : null}
      {state.kind === "not-enrolled" ? (
        <p className="text-sm text-slate-600">You are not in a course yet, so there is nothing to answer here. <Link href={CSE115A_DASHBOARD_PATH} className="font-medium text-blue-700 underline">Join your course</Link> with the code from your instructor, then come back to this page.</p>
      ) : null}
      {state.kind === "enrolled" ? (
        <>
          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
          {state.courses.map((course) => (
            <div key={course.id} className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">{course.title} · {course.term}</p>
              <ResearchConsentQuestion
                headingId={`consent-heading-${course.id}`}
                consent={currentConsent(state.consent, course.id)}
                saving={Boolean(saving[course.id])}
                saved={Boolean(saved[course.id])}
                showAnswer
                onAnswer={(consented) => onAnswer(course, consented)}
              />
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

export function ConsentPage() {
  const [state, setState] = useState<ConsentPageState>({ kind: "loading" });
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/cse115a/me", { credentials: "include" });
      const body = await response.json().catch(() => null);
      setState(consentPageState(response.status, body));
    } catch {
      setState({ kind: "error", message: "Could not load your courses." });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function answer(course: ConsentCourse, consented: boolean) {
    setSaving((previous) => ({ ...previous, [course.id]: true }));
    setSaved((previous) => ({ ...previous, [course.id]: false }));
    setError(null);
    try {
      const stored = await saveConsentAnswer(course.slug, consented);
      setState((previous) => previous.kind === "enrolled"
        ? { ...previous, consent: [...previous.consent.filter((row) => row.course_id !== stored.course_id), stored] }
        : previous);
      setSaved((previous) => ({ ...previous, [course.id]: true }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your choice.");
    } finally {
      setSaving((previous) => ({ ...previous, [course.id]: false }));
    }
  }

  return <ConsentPageView state={state} saving={saving} saved={saved} error={error} onAnswer={(course, consented) => void answer(course, consented)} />;
}
