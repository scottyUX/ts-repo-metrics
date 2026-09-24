import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import type { RepoReport } from "@/lib/reportTypes";

export default async function Cse115aPreviewResultsPage() {
  if (process.env.NODE_ENV !== "development" || process.env.CSE115A_SITE !== "true") notFound();

  const reportPath = path.resolve(process.cwd(), "../../reports/ts-repo-metrics.json");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as RepoReport;

  return (
    <div className="w-full max-w-6xl space-y-5 py-6">
      <div className="rounded-md border border-border bg-muted p-5 text-foreground">
        <Link href="/cse115a/preview" className="text-sm font-medium text-primary underline">← Back to assignment preview</Link>
        <h1 className="mt-3 text-xl font-semibold">Example Repo Metrics dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">This is a saved analysis of the Repo Metrics repository so you can explore the tabs. It is demo data, not the example task PR. Real student results use the exact PR they submitted.</p>
      </div>
      <ResultsDashboard report={report} resultId="cse115a-preview-report" courseTask={{
        taskId: "US-1-T-1",
        prUrl: "https://github.com/example/team-project/pull/12",
        taskPath: "docs/tasks/sprint-1/US-1-T-1.md",
        spec: {
          id: "US-1-T-1", story: "US-1", sprint: 1, assignee: "A. Student", estimateHours: 3,
          title: "Reject a non-university email on login",
          description: "Covers the rejection path only. Successful login is out of scope.",
          specs: "A non-UCSC email returns HTTP 400 without creating a session.",
          requirements: "Use the existing login handler; add no runtime dependency.",
          acceptanceCriteria: "Reject a non-university email; set no session cookie; accept case-insensitive UCSC domains.",
          tests: "Each acceptance criterion has a named test with setup and assertion.",
        },
        validation: { prMerged: true, specCommittedFirst: true, baseTagPushed: false, doneTagOnMergeCommit: true },
      }} />
    </div>
  );
}
