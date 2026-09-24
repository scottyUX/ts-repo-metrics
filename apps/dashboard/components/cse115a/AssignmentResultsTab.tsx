import type { TaskSpec } from "@/lib/cse115a/taskSpec";
import { RUBRIC } from "@/lib/cse115a/rubric";

export type CourseTaskEvidence = {
  taskId: string;
  prUrl: string;
  taskPath: string;
  spec: TaskSpec;
  validation: Record<string, boolean>;
  commitsEndpoint?: string;
};


const PROCESS_LABELS: Record<string, string> = {
  prMerged: "PR merged",
  prAuthoredByStudent: "PR opened by student",
  prTitleHasTaskId: "Task ID in PR title",
  branchHasTaskId: "Task ID in branch",
  baseTagPushed: "Base tag pushed",
  specCommittedFirst: "Task spec committed first",
  doneTagOnMergeCommit: "Done tag on merge commit",
  estimateAtLeastTwoHours: "Estimate at least two hours",
};

function EvidenceText({ label, value }: { label: string; value: string }) {
  return <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{value}</p></div>;
}

function SubmittedEvidence({ task, section }: { task: CourseTaskEvidence; section: string }) {
  const spec = task.spec;
  if (section === "Scope") return <div className="space-y-4"><EvidenceText label="Title" value={spec.title} /><EvidenceText label="Description" value={spec.description} /><EvidenceText label="Requirements" value={spec.requirements} /></div>;
  if (section === "Specs") return <EvidenceText label="Specs" value={spec.specs} />;
  if (section === "Acceptance criteria") return <EvidenceText label="Acceptance criteria" value={spec.acceptanceCriteria} />;
  if (section === "Tests section") return <EvidenceText label="Tests" value={spec.tests} />;
  if (section === "Test quality") return <div className="space-y-2 text-sm text-muted-foreground"><p>The submitted Tests section is below. The grader also checks the actual tests in the PR and whether they fail without the implementation.</p><EvidenceText label="Test plan" value={spec.tests} /><a href={`${task.prUrl}/files`} target="_blank" rel="noopener noreferrer" className="text-primary underline">Review changed test files on GitHub</a></div>;
  if (section === "Tests pass") return <div className="space-y-2 text-sm text-muted-foreground"><p>Passing tests at the done tag require grader review of CI and the repository. This page does not infer a pass from the task description.</p><a href={`${task.prUrl}/checks`} target="_blank" rel="noopener noreferrer" className="text-primary underline">Review PR checks on GitHub</a></div>;
  return <ul className="space-y-2 text-sm">{Object.entries(task.validation).map(([key, found]) => <li key={key} className="flex items-center gap-2"><span className={found ? "text-emerald-500" : "text-amber-500"} aria-hidden>{found ? "✓" : "○"}</span><span className="text-foreground">{PROCESS_LABELS[key] ?? key}</span><span className="text-muted-foreground">{found ? "Found" : "Review needed"}</span></li>)}</ul>;
}

export function AssignmentResultsTab({ task }: { task: CourseTaskEvidence }) {
  const checks = task.validation;
  const observed = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Assignment results</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{task.taskId}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Rubric review pending · each task is worth 10 points</p>
          </div>
          <div className="rounded-lg border border-border bg-muted px-5 py-3 text-right">
            <p className="text-xs text-muted-foreground">Awarded points</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">— / 10</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">The grader reads the task file, tests, merged PR, tags, and Scrum board. Repo Metrics provides evidence; it does not award points automatically.</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Merged PR</a>
          <span className="font-mono text-muted-foreground">{task.taskPath}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Evidence imported</p>
          <p className="mt-1 text-sm text-muted-foreground">{observed} of {totalChecks} automated process checks found. A missing check is a prompt for review, not an automatic deduction.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Sprint score</p>
          <p className="mt-1 text-sm text-muted-foreground">Average of the two best task scores. A missing task scores 0. The score appears after grading.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold text-foreground">Task rubric</h3>
          <p className="mt-1 text-sm text-muted-foreground">Open a section to see the submitted evidence and how it is graded.</p>
        </div>
        <div className="divide-y divide-border">
          {RUBRIC.map((row) => (
            <details key={row.name} className="group">
              <summary className="grid cursor-pointer list-none gap-3 px-5 py-4 hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_5rem] md:items-center [&::-webkit-details-marker]:hidden">
                <div><p className="font-semibold text-foreground"><span aria-hidden className="mr-2 inline-block text-primary transition-transform group-open:rotate-90">›</span>{row.name}</p><p className="mt-1 text-xs text-muted-foreground">Evidence: {row.evidence}</p></div>
                <p className="text-sm text-muted-foreground">{row.full}</p>
                <p className="text-sm font-medium tabular-nums text-foreground md:text-right">— / {row.points}</p>
              </summary>
              <div className="space-y-5 border-t border-border bg-muted/20 px-5 py-5">
                <div><h4 className="mb-3 text-sm font-semibold text-foreground">Submitted evidence</h4><SubmittedEvidence task={task} section={row.name} /></div>
                <div className="border-t border-border pt-4"><h4 className="text-sm font-semibold text-foreground">Rubric guidance</h4><ul className="mt-2 space-y-1 text-sm text-muted-foreground"><li><strong className="text-foreground">Full:</strong> {row.full}</li><li><strong className="text-foreground">Partial:</strong> {row.partial}</li><li><strong className="text-foreground">None:</strong> {row.none}</li></ul></div>
              </div>
            </details>
          ))}
        </div>
      </div>
      <a href="https://github.com/scottyUX/hecate-router/blob/main/docs/cse115a-sprint-task-specifications.md" target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-primary underline">Read the full assignment rubric</a>
    </div>
  );
}
