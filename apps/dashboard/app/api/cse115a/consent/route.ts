import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getCourseIdentity, getEnrolledCourse } from "@/lib/cse115a/server";
import { CONSENT_VERSION } from "@/lib/cse115a/consent";

export const runtime = "nodejs";

/** Records the student's current research consent for a course. */
export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const identity = await getCourseIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in with UCSC Google." }, { status: 401 });
  const body = await request.json().catch(() => null) as { courseSlug?: unknown; consented?: unknown } | null;
  if (typeof body?.consented !== "boolean") return NextResponse.json({ error: "consented must be true or false." }, { status: 400 });
  const course = await getEnrolledCourse(identity.userId, typeof body.courseSlug === "string" ? body.courseSlug : "");
  if (!course) return NextResponse.json({ error: "Join this course first." }, { status: 403 });
  const row = { course_id: course.id, user_id: identity.userId, consented: body.consented, consent_version: CONSENT_VERSION, updated_at: new Date().toISOString() };
  const { error } = await getSupabase().from("cse_research_consent").upsert(row, { onConflict: "course_id,user_id" });
  if (error) return NextResponse.json({ error: "Could not save your choice." }, { status: 500 });
  return NextResponse.json({ consent: { course_id: course.id, consented: row.consented, consent_version: row.consent_version, updated_at: row.updated_at } });
}
