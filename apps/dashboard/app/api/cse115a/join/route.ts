import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getCourseIdentity } from "@/lib/cse115a/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const identity = await getCourseIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in with a verified UCSC Google account." }, { status: 401 });
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.toUpperCase().replace(/[\s-]/g, "") : "";
  if (!/^[A-Z2-9]{12,24}$/.test(code)) {
    return NextResponse.json({ error: "Enter the course code from your instructor." }, { status: 400 });
  }
  const hash = createHash("sha256").update(code).digest("hex");
  const db = getSupabase();
  const { data: joinCode, error: codeError } = await db.from("cse_course_codes")
    .select("course_id,expires_at,revoked_at")
    .eq("code_hash", hash).maybeSingle();
  if (codeError || !joinCode || joinCode.revoked_at || new Date(joinCode.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This course code is invalid or expired." }, { status: 400 });
  }
  const { data: course } = await db.from("cse_courses")
    .select("id,slug,title,term,assignment_count,active")
    .eq("id", joinCode.course_id).maybeSingle();
  if (!course?.active) return NextResponse.json({ error: "This course is no longer accepting students." }, { status: 400 });
  const { error: joinError } = await db.from("cse_course_memberships").upsert({
    course_id: course.id,
    user_id: identity.userId,
    ucsc_email: identity.email,
  }, { onConflict: "course_id,user_id", ignoreDuplicates: true });
  if (joinError) return NextResponse.json({ error: "Could not join this course." }, { status: 500 });
  return NextResponse.json({ course: { id: course.id, slug: course.slug, title: course.title, term: course.term, assignmentCount: course.assignment_count } });
}
