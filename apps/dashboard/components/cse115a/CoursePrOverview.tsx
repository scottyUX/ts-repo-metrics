"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { RepoReport } from "@/lib/reportTypes";
import type { CourseTaskEvidence } from "./AssignmentResultsTab";
import { AssignmentResultsTab } from "./AssignmentResultsTab";

type Section = "summary" | "commits" | "checks" | "files";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "commits", label: "Commits" },
  { id: "checks", label: "Checks" },
  { id: "files", label: "Files changed" },
];
type CommitRow = { sha: string; url: string; title: string; body: string; author: string; date: string };
type PullMeta = { title: string; mergedAt: string | null; mergedBy: string | null; base: string; head: string; commitCount: number };
const PREVIEW_COMMITS: CommitRow[] = [
  { sha: "a12b34c", url: "", title: "Write task specification", body: "", author: "A. Student", date: "2026-09-21T16:10:00Z" },
  { sha: "d56e78f", url: "", title: "Implement login rejection and tests", body: "", author: "A. Student", date: "2026-09-22T19:40:00Z" },
];

function dateLabel(value: string | null | undefined): string {
  if (!value) return "date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "date unavailable" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function CoursePrOverview({ task, report, children }: { task?: CourseTaskEvidence; report: RepoReport; children: ReactNode }) {
  const [section, setSection] = useState<Section>("summary");
  const [commitData, setCommitData] = useState<{ commits: CommitRow[]; pull: PullMeta; truncated: boolean } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  useEffect(() => {
    if (!task?.commitsEndpoint) return;
    const controller = new AbortController();
    void fetch(task.commitsEndpoint, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { commits?: CommitRow[]; pull?: PullMeta; truncated?: boolean; error?: string };
        if (!response.ok || !body.commits || !body.pull) throw new Error(body.error ?? "Could not load PR commits.");
        setCommitData({ commits: body.commits, pull: body.pull, truncated: Boolean(body.truncated) });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setCommitError(error instanceof Error ? error.message : "Could not load PR commits."); });
    return () => controller.abort();
  }, [task?.commitsEndpoint]);
  if (!task) return <>{children}</>;
  const prNumber = task.prUrl.match(/\/pull\/(\d+)/)?.[1] ?? report.source?.prNumber;
  const changedFiles = report.source?.changedFiles ?? [];
  const prScoped = report.source?.scope === "pr";
  const merged = task.validation.prMerged === true;
  const commits = task.commitsEndpoint ? commitData?.commits ?? [] : PREVIEW_COMMITS;
  const pull = commitData?.pull ?? (task.commitsEndpoint ? null : { title: task.spec.title, mergedAt: "2026-09-22T20:00:00Z", mergedBy: task.spec.assignee, base: "main", head: `task/${task.taskId}`, commitCount: PREVIEW_COMMITS.length });
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">Assignment task · {task.taskId}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{pull?.title ?? task.spec.title} <span className="font-normal text-muted-foreground">#{prNumber}</span></h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-3 py-1 font-semibold ${merged ? "bg-purple-600 text-white" : "bg-muted text-foreground"}`}>{merged ? "Merged" : "PR status needs review"}</span>
          <span className="text-muted-foreground">{task.spec.assignee} · Sprint {task.spec.sprint}</span>
          <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open on GitHub</a>
        </div>
        {merged && pull ? <p className="text-sm text-muted-foreground"><strong className="text-foreground">{pull.mergedBy ?? "A teammate"}</strong> merged {pull.commitCount} {pull.commitCount === 1 ? "commit" : "commits"} into <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{pull.base}</span> from <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{pull.head}</span> on {dateLabel(pull.mergedAt)}.</p> : null}
      </header>

      <nav aria-label="Pull request sections" className="flex flex-wrap gap-1 border-b border-border">
        {SECTIONS.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined} className={`border-b-2 px-4 py-3 text-sm font-medium ${section === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {item.label}{item.id === "commits" && pull ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{pull.commitCount}</span> : null}{prScoped && item.id === "files" ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{changedFiles.length}</span> : null}
        </button>)}
      </nav>

      {section === "summary" ? <AssignmentResultsTab task={task} /> : null}

      {section === "commits" ? <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5"><h2 className="font-semibold">Commits in this pull request</h2><p className="mt-1 text-sm text-muted-foreground">{task.commitsEndpoint ? "Commit history from the submitted GitHub PR." : "Example timeline for the preview task."}</p></div>
        {commitError ? <p role="alert" className="p-5 text-sm text-destructive">{commitError}</p> : null}
        {task.commitsEndpoint && !commitData && !commitError ? <p className="p-5 text-sm text-muted-foreground">Loading commits…</p> : null}
        {commits.length ? <ol className="divide-y divide-border">{commits.map((commit) => <li key={commit.sha} className="flex gap-4 px-5 py-4">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-foreground">●</span>
          <div className="min-w-0 flex-1"><p className="font-medium text-foreground">{commit.title}</p><p className="mt-1 text-sm text-muted-foreground"><strong className="text-foreground">{commit.author}</strong> committed on {dateLabel(commit.date)}</p></div>
          {commit.url ? <a href={commit.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-xs text-primary underline">{commit.sha.slice(0, 7)}</a> : <span className="shrink-0 font-mono text-xs text-muted-foreground">{commit.sha.slice(0, 7)}</span>}
        </li>)}</ol> : null}
        {commitData?.truncated ? <p className="border-t border-border p-4 text-sm text-muted-foreground">Showing the first 500 commits. Open GitHub for the full history.</p> : null}
        <div className="border-t border-border p-5"><a href={`${task.prUrl}/commits`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">View full commit history on GitHub</a></div>
      </section> : null}

      {section === "checks" ? children : null}

      {section === "files" ? <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5"><h2 className="font-semibold">Changed source files analyzed</h2><p className="mt-1 text-sm text-muted-foreground">Metrics on this page are scoped to these PR source files.</p></div>
        {prScoped && changedFiles.length ? <ul className="divide-y divide-border">{changedFiles.map((file) => <li key={file} className="px-5 py-3 font-mono text-sm text-foreground">{file}</li>)}</ul> : <p className="p-5 text-sm text-muted-foreground">{prScoped ? "No changed source file list is available in this report." : "This preview uses a repository sample report. A real PR analysis lists its changed source files here."}</p>}
        <div className="border-t border-border p-5"><a href={`${task.prUrl}/files`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">View full diff on GitHub</a></div>
      </section> : null}
    </div>
  );
}
