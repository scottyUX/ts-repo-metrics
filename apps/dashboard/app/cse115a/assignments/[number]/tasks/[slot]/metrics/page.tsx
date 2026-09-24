import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { getCourseIdentity, getEnrolledCourse } from "@/lib/cse115a/server";
import { getSupabase } from "@/lib/supabase/server";
import { parseGitHubUrl } from "@/lib/github/parseGitHubUrl";
import type { RepoReport } from "@/lib/reportTypes";
import type { TaskSpec } from "@/lib/cse115a/taskSpec";

type Params = { params: Promise<{ number: string; slot: string }> };

export default async function Cse115aTaskMetricsPage({ params }: Params) {
  const identity = await getCourseIdentity();
  if (!identity) redirect("/cse115a/signin");

  const { number, slot } = await params;
  const assignmentNumber = Number(number);
  const taskSlot = Number(slot);
  if (!Number.isInteger(assignmentNumber) || ![1, 2].includes(taskSlot)) notFound();

  const db = getSupabase();
  const { data: task } = await db.from("cse_task_submissions")
    .select("course_id,assignment_number,task_slot,task_id,pr_url,repo_full_name,pr_number,task_path,task_spec_json,validation_json,analysis_result_id")
    .eq("user_id", identity.userId)
    .eq("assignment_number", assignmentNumber)
    .eq("task_slot", taskSlot)
    .maybeSingle();
  if (!task?.analysis_result_id) notFound();

  const { data: courseRow } = await db.from("cse_courses")
    .select("slug,title,term")
    .eq("id", task.course_id)
    .maybeSingle();
  if (!courseRow || !await getEnrolledCourse(identity.userId, courseRow.slug)) notFound();

  const { data: analysis } = await db.from("analyses")
    .select("result_id,repo_url,report_json")
    .eq("result_id", task.analysis_result_id)
    .eq("user_id", identity.userId)
    .eq("course_id", courseRow.slug)
    .maybeSingle();
  const repo = analysis ? parseGitHubUrl(analysis.repo_url) : null;
  const report = analysis?.report_json as RepoReport | undefined;
  if (!analysis || !report || report.source?.scope !== "pr" || report.source.prNumber !== task.pr_number ||
      !repo || `${repo.owner}/${repo.repo}`.toLowerCase() !== task.repo_full_name.toLowerCase()) notFound();

  return (
    <div className="w-full max-w-6xl space-y-5 py-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/cse115a/dashboard" className="font-medium text-primary underline">← Back to assignments</Link>
        <span className="text-muted-foreground">{courseRow.title} · {courseRow.term} · Assignment {assignmentNumber} · Task {taskSlot}</span>
      </div>
      <ResultsDashboard report={report} resultId={analysis.result_id} courseTask={{
        taskId: task.task_id,
        prUrl: task.pr_url,
        taskPath: task.task_path,
        spec: task.task_spec_json as TaskSpec,
        validation: task.validation_json as Record<string, boolean>,
        commitsEndpoint: `/api/cse115a/assignments/${assignmentNumber}/tasks/${taskSlot}/commits`,
      }} />
    </div>
  );
}
