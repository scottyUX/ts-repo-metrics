"use client";

import { useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// The sprint workflow from the task instructions, shown full screen when a
// student opens a sprint they have not started. Ticks are a personal to-do list
// kept in this browser only; the app's own checks on each PR are what count.

const INSTRUCTIONS_URL = "https://github.com/scottyUX/hecate-router/blob/main/docs/cse115a-sprint-task-specifications.md";

type Item = { key: string; title: string; detail: React.ReactNode };
type Group = { title: string; items: Item[] };

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}

function Commands({ lines }: { lines: string[] }) {
  return <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs leading-relaxed text-foreground">{lines.join("\n")}</pre>;
}

function groups(sprint: number): Group[] {
  const path = `docs/tasks/sprint-${sprint}/<id>.md`;
  return [
    {
      title: "Before you code",
      items: [
        { key: "spec", title: "Write your task file", detail: <>
          <p>Create <Code>{path}</Code> with the six fields: Title, Description, Specs, Requirements, Acceptance criteria, and Tests.</p>
          <p className="mt-2">Copy the worked example so the front matter and headings match exactly. <Code>sprint:</Code> must be {sprint}.</p>
        </> },
        { key: "board", title: "Put it on the Scrum board", detail: <p>Add a card for the task to your team’s board, for example GitHub Projects. The app can’t see your board, so this one is up to you.</p> },
        { key: "branch", title: "Start a branch", detail: <>
          <p>From an up-to-date <Code>main</Code>:</p>
          <Commands lines={["git switch -c task/<id>"]} />
          <p className="mt-2">The task ID has to be in the branch name.</p>
        </> },
        { key: "base", title: "Commit the spec first and tag it", detail: <>
          <p>Commit only the task file, tag it, and push, before writing any code:</p>
          <Commands lines={[`git add ${path}`, `git commit -m "<id>: task spec"`, "git tag <id>-base", "git push origin task/<id> <id>-base"]} />
          <p className="mt-2">This commit must stay first on the branch. Don’t rebase or amend it.</p>
        </> },
      ],
    },
    {
      title: "Build and merge",
      items: [
        { key: "impl", title: "Build it with tests", detail: <p>Add the code and at least one test for every acceptance criterion, on the same branch. Don’t weaken a test to make it pass.</p> },
        { key: "pr", title: "Open your pull request", detail: <p>Open it from your own GitHub account, titled <Code>{"<id>: <title>"}</Code>. It should change only this task’s file under <Code>docs/tasks/</Code>.</p> },
        { key: "merge", title: "Get a review and merge", detail: <p>A teammate reviews it. Merge once your team’s tests pass.</p> },
        { key: "done", title: "Tag the merge", detail: <>
          <p>Find the merge commit on the PR page (“merged commit <Code>abc1234</Code>”), then:</p>
          <Commands lines={["git fetch origin", "git tag <id>-done <merge commit sha>", "git push origin <id>-done"]} />
        </> },
      ],
    },
    {
      title: "In this app",
      items: [
        { key: "add", title: "Add your PR here", detail: <p>Push the <Code>-done</Code> tag first, then paste the merged PR link. If a check shows ✗, follow its fix and click Re-check.</p> },
        { key: "submit", title: `Submit Sprint ${sprint}`, detail: <p>When both tasks are in, click Submit Sprint {sprint}. Both tasks lock when you submit, but you can change your submission until the sprint closes.</p> },
      ],
    },
  ];
}

function InfoBubble({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" aria-label={`How to: ${title}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
          <Info className="size-4" aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content side="bottom" align="end" sideOffset={6} collisionPadding={16}
          className="z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-popover p-4 text-sm leading-relaxed text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <p className="mb-2 font-semibold text-foreground">{title}</p>
          <div className="text-muted-foreground">{children}</div>
          <PopoverPrimitive.Arrow className="fill-border" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function storageKey(courseSlug: string, sprint: number) {
  return `cse115a:checklist:${courseSlug}:${sprint}`;
}

function readTicks(key: string): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function SprintChecklistDialog({ open, onOpenChange, courseSlug, sprint }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseSlug: string;
  sprint: number;
}) {
  const key = storageKey(courseSlug, sprint);
  // Ticks are read from storage the first time each sprint's checklist opens.
  const [saved, setSaved] = useState<{ key: string; ticks: Record<string, boolean> } | null>(null);
  if (open && saved?.key !== key) setSaved({ key, ticks: readTicks(key) });
  const ticks = saved?.key === key ? saved.ticks : {};

  function toggle(item: string) {
    setSaved((previous) => {
      const current = previous?.key === key ? previous.ticks : {};
      const next = { ...current, [item]: !current[item] };
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* ticks are a convenience */ }
      return { key, ticks: next };
    });
  }

  const all = groups(sprint);
  const total = all.reduce((sum, group) => sum + group.items.length, 0);
  const done = all.reduce((sum, group) => sum + group.items.filter((item) => ticks[item.key]).length, 0);
  const numbers = new Map(all.flatMap((group) => group.items).map((item, index) => [item.key, index + 1]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
            <p className="text-sm font-medium text-primary">Sprint {sprint}</p>
            <DialogTitle className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Your sprint checklist</DialogTitle>
            <DialogDescription className="mt-3 text-lg text-muted-foreground">
              Follow these steps for each of your two tasks. Tap <Info className="inline size-4 align-[-2px]" aria-label="the info icon" /> for how to do a step.
            </DialogDescription>

            <div className="mt-10 space-y-10">
              {all.map((group) => (
                <section key={group.title} aria-labelledby={`checklist-${group.title}`}>
                  <h3 id={`checklist-${group.title}`} className="text-sm font-semibold text-muted-foreground">{group.title}</h3>
                  <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                    {group.items.map((item) => {
                      const checked = Boolean(ticks[item.key]);
                      return (
                        <li key={item.key} className="flex items-center gap-2 pr-3">
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 px-4 py-4 hover:bg-muted/60">
                            <input type="checkbox" checked={checked} onChange={() => toggle(item.key)} className="peer sr-only" />
                            <span aria-hidden className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded-md border peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                              checked ? "border-success bg-success text-success-foreground" : "border-border bg-background",
                            )}>
                              {checked ? <Check className="size-4" strokeWidth={3} /> : null}
                            </span>
                            <span className={cn("text-lg", checked ? "text-muted-foreground line-through" : "text-foreground")}>
                              <span className="mr-2 text-muted-foreground tabular-nums">{numbers.get(item.key)}.</span>{item.title}
                            </span>
                          </label>
                          <InfoBubble title={item.title}>{item.detail}</InfoBubble>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-background">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-5 py-4">
            <a href={INSTRUCTIONS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              Full instructions <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground" aria-live="polite">{done} of {total} done</span>
              <Button type="button" size="lg" onClick={() => onOpenChange(false)}>Got it</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
