import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { getCourseIdentity, requireSubmissionStaff } from "@/lib/cse115a/server";
import { getSupabase } from "@/lib/supabase/server";
import type { RepoReport } from "@/lib/reportTypes";
import type { SubmissionSnapshot } from "@/lib/cse115a/submissionSnapshot";

type Params = { params: Promise<{ id: string; slot: string }> };

/** The Repo Metrics report a submitted task was analyzed with, for course staff. */
export default async function Cse115aStaffTaskMetricsPage({ params }: Params) {
  const identity = await getCourseIdentity();
  if (!identity) redirect("/cse115a/signin");
  const { id, slot } = await params;
  const course = await requireSubmissionStaff(identity, id);
  if (!course) notFound();

  const db = getSupabase();
  const { data: submission } = await db.from("cse_assignment_submissions")
    .select("assignment_number,snapshot").eq("id", id).maybeSingle();
  const task = (submission?.snapshot as SubmissionSnapshot | undefined)?.tasks.find((item) => item.slot === Number(slot));
  if (!submission || !task) notFound();
  const { data: analysis } = await db.from("analyses").select("result_id,report_json").eq("result_id", task.analysisResultId).maybeSingle();
  const report = analysis?.report_json as RepoReport | undefined;
  if (!analysis || !report) notFound();

  return (
    <div className="w-full max-w-6xl space-y-5 py-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/cse115a/instructor/submissions/${id}`} className="font-medium text-primary underline">← Back to review</Link>
        <span className="text-muted-foreground">{course.title} · {course.term} · Assignment {submission.assignment_number} · Task {task.slot}</span>
      </div>
      <ResultsDashboard report={report} resultId={analysis.result_id} courseTask={{
        taskId: task.taskId,
        prUrl: task.prUrl,
        taskPath: task.taskPath,
        spec: task.spec,
        validation: task.validation,
      }} />
    </div>
  );
}
