import "server-only";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getCourseIdentity, requireCourseStaff, requireSubmissionStaff, type CourseIdentity, type StaffCourse } from "@/lib/cse115a/server";

// Guards for instructor routes. Each returns the context, or the response to send.

type Guarded = { identity: CourseIdentity; course: StaffCourse } | { response: NextResponse };

async function signedIn(): Promise<CourseIdentity | NextResponse> {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const identity = await getCourseIdentity();
  return identity ?? NextResponse.json({ error: "Sign in with UCSC Google." }, { status: 401 });
}

const forbidden = (instructorOnly?: boolean) => NextResponse.json(
  { error: instructorOnly ? "Only instructors can do this." : "You are not on this course's staff." }, { status: 403 });

export async function guardCourse(slug: string, options: { instructorOnly?: boolean } = {}): Promise<Guarded> {
  const identity = await signedIn();
  if (identity instanceof NextResponse) return { response: identity };
  const course = await requireCourseStaff(identity, slug, options);
  return course ? { identity, course } : { response: forbidden(options.instructorOnly) };
}

export async function guardSubmission(id: string, options: { instructorOnly?: boolean } = {}): Promise<Guarded> {
  const identity = await signedIn();
  if (identity instanceof NextResponse) return { response: identity };
  const course = await requireSubmissionStaff(identity, id, options);
  return course ? { identity, course } : { response: forbidden(options.instructorOnly) };
}

export async function guardSignedIn(): Promise<{ identity: CourseIdentity } | { response: NextResponse }> {
  const identity = await signedIn();
  return identity instanceof NextResponse ? { response: identity } : { identity };
}
