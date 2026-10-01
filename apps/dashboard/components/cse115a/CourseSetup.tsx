"use client";

import { Check, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// First-visit setup for CSE 115A students: UCSC account, course code, GitHub.
// Presentational; the dashboard owns the join and GitHub OAuth calls.

export type CourseSetupProps = {
  email: string | null;
  courseLabel: string | null;
  githubConnected: boolean | null;
  githubLogin?: string | null;
  joinCode: string;
  onJoinCodeChange: (value: string) => void;
  onJoin: () => void;
  joining: boolean;
  joinError?: string | null;
  onConnectGithub: () => void;
  connectingGithub: boolean;
  githubError?: string | null;
  disabled?: boolean;
};

type StepKey = "account" | "course" | "github";
type StepState = "done" | "current" | "upcoming";

function StepMarker({ state, number }: { state: StepState; number: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        state === "done" && "bg-success/15 text-success",
        state === "current" && "bg-primary text-primary-foreground",
        state === "upcoming" && "border border-border text-muted-foreground",
      )}
    >
      {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : number}
    </span>
  );
}

const STATUS_TEXT: Record<StepState, string> = { done: "done", current: "current step", upcoming: "not started" };

export function CourseSetup(props: CourseSetupProps) {
  const joined = Boolean(props.courseLabel);
  const steps: Array<{ key: StepKey; label: string; done: boolean; detail: React.ReactNode }> = [
    { key: "account", label: "UCSC account", done: true, detail: props.email },
    { key: "course", label: joined ? "Course" : "Enter your course code", done: joined, detail: props.courseLabel },
    {
      key: "github",
      label: props.githubConnected ? "GitHub" : "Connect GitHub",
      done: props.githubConnected === true,
      detail: props.githubLogin
        ? <span className="inline-flex items-center gap-1.5"><Github className="size-3.5" aria-hidden />@{props.githubLogin}</span>
        : props.githubConnected ? "Connected" : null,
    },
  ];
  const current = steps.findIndex((step) => !step.done);
  const stateOf = (index: number): StepState => (steps[index]!.done ? "done" : index === current ? "current" : "upcoming");

  return (
    <Card aria-labelledby="course-setup-heading" className="mx-auto w-full max-w-xl gap-0 px-6 py-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 id="course-setup-heading" className="text-xl font-semibold text-foreground">Set up your course</h1>
        <p className="text-sm text-muted-foreground">{current === -1 ? "All set" : `Step ${current + 1} of ${steps.length}`}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">You only do this once.</p>

      <ol className="mt-4 divide-y divide-border">
        {steps.map((step, index) => {
          const state = stateOf(index);
          return (
            <li key={step.key} aria-current={state === "current" ? "step" : undefined} className="flex gap-3 py-3">
              <StepMarker state={state} number={index + 1} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className={cn(
                    state === "current" && "font-semibold text-foreground",
                    state === "done" && "text-muted-foreground",
                    state === "upcoming" && "inline-flex items-center gap-1.5 text-muted-foreground",
                  )}>
                    {state === "upcoming" && step.key === "github" ? <Github className="size-3.5" aria-hidden /> : null}
                    {step.label}
                    <span className="sr-only">, {STATUS_TEXT[state]}</span>
                  </span>
                  {state === "done" && step.detail ? <span className="text-muted-foreground">{step.detail}</span> : null}
                </p>

                {state === "current" && step.key === "course" ? (
                  <form className="mt-2" noValidate onSubmit={(event) => { event.preventDefault(); props.onJoin(); }}>
                    <p id="course-code-hint" className="text-sm text-muted-foreground">Your instructor posts it on Canvas.</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <label htmlFor="course-code" className="sr-only">Course code</label>
                      <Input id="course-code" value={props.joinCode} onChange={(event) => props.onJoinCodeChange(event.target.value)}
                        placeholder="7K2Q-9XMP" autoComplete="off" spellCheck={false}
                        aria-invalid={props.joinError ? true : undefined}
                        aria-describedby={props.joinError ? "course-code-hint course-code-error" : "course-code-hint"}
                        className="uppercase placeholder:normal-case" />
                      <Button type="submit" disabled={props.joining || props.disabled}>{props.joining ? "Joining…" : "Join course"}</Button>
                    </div>
                    {props.joinError ? <p id="course-code-error" role="alert" className="mt-2 text-sm text-destructive">{props.joinError}</p> : null}
                  </form>
                ) : null}

                {state === "current" && step.key === "github" ? (
                  <div className="mt-2 space-y-3 text-sm text-muted-foreground">
                    <p>Repo Metrics reads your team’s repository to check your task PRs. It never pushes code or changes your repo.</p>
                    {props.githubConnected === null ? <p role="status">Checking GitHub…</p> : (
                      <Button type="button" onClick={props.onConnectGithub} disabled={props.connectingGithub || props.disabled}>
                        <Github aria-hidden />
                        {props.connectingGithub ? "Opening GitHub…" : "Connect GitHub"}
                      </Button>
                    )}
                    {props.githubError ? (
                      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {props.githubError}
                      </p>
                    ) : null}
                    <p className="text-xs">
                      Team repo in a GitHub organization? On GitHub’s screen, click <strong className="font-semibold text-foreground">Grant</strong> next
                      to it. If you see <strong className="font-semibold text-foreground">Request</strong>, ask a repo owner to approve Repo Metrics.
                    </p>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
