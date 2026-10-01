import { NextResponse } from "next/server";
import { getCourseIdentity, getEnrolledCourse } from "@/lib/cse115a/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getDecryptedGitHubTokenForUser } from "@/lib/userGitHubToken";

export const runtime = "nodejs";

type Params = { params: Promise<{ number: string; slot: string }> };
type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
  author: { login: string } | null;
};
type GitHubPull = {
  title: string;
  merged_at: string | null;
  merged_by: { login: string } | null;
  user: { login: string } | null;
  base: { ref: string };
  head: { ref: string };
  commits: number;
};

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const identity = await getCourseIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in with UCSC Google." }, { status: 401 });
  const { number, slot } = await params;
  const assignmentNumber = Number(number);
  const taskSlot = Number(slot);
  if (!Number.isInteger(assignmentNumber) || assignmentNumber < 1 || ![1, 2].includes(taskSlot)) {
    return NextResponse.json({ error: "Invalid task." }, { status: 400 });
  }
  const db = getSupabase();
  const { data: task } = await db.from("cse_task_submissions")
    .select("course_id,repo_full_name,pr_number")
    .eq("user_id", identity.userId)
    .eq("assignment_number", assignmentNumber)
    .eq("task_slot", taskSlot)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const { data: course } = await db.from("cse_courses").select("slug").eq("id", task.course_id).maybeSingle();
  if (!course || !await getEnrolledCourse(identity.userId, course.slug)) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const token = await getDecryptedGitHubTokenForUser(identity.userId);
  if (!token) return NextResponse.json({ error: "Reconnect GitHub to view this PR’s commits." }, { status: 403 });
  const [owner, repo] = String(task.repo_full_name).split("/");
  if (!owner || !repo) return NextResponse.json({ error: "Invalid repository." }, { status: 500 });

  const commits: Array<{ sha: string; url: string; title: string; body: string; author: string; date: string }> = [];
  try {
    const pullResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${task.pr_number}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!pullResponse.ok) return NextResponse.json({ error: "GitHub could not load this pull request." }, { status: 502 });
    const pull = await pullResponse.json() as GitHubPull;
    for (let page = 1; page <= 5; page++) {
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${task.pr_number}/commits?per_page=100&page=${page}`, {
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) return NextResponse.json({ error: "GitHub could not load this PR’s commits. Reconnect GitHub and try again." }, { status: 502 });
      const batch = await response.json() as GitHubCommit[];
      commits.push(...batch.map((item) => {
        const [title, ...body] = item.commit.message.split("\n");
        return { sha: item.sha, url: item.html_url, title: title ?? "Commit", body: body.join("\n").trim(), author: item.author?.login ?? item.commit.author?.name ?? "Unknown author", date: item.commit.author?.date ?? "" };
      }));
      if (batch.length < 100) break;
    }
    return NextResponse.json({
      commits,
      truncated: commits.length >= 500,
      pull: { title: pull.title, mergedAt: pull.merged_at, mergedBy: pull.merged_by?.login ?? pull.user?.login ?? null, base: pull.base.ref, head: pull.head.ref, commitCount: pull.commits },
    });
  } catch {
    return NextResponse.json({ error: "Could not load this PR’s commits." }, { status: 502 });
  }
}
