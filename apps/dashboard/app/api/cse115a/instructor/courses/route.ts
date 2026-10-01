import { NextResponse } from "next/server";
import { getStaffCourses } from "@/lib/cse115a/server";
import { guardSignedIn } from "@/lib/cse115a/instructorApi";

export const runtime = "nodejs";

/** Courses the caller teaches. Empty for students, so the header can hide the instructor link. */
export async function GET() {
  const guard = await guardSignedIn();
  if ("response" in guard) return guard.response;
  return NextResponse.json({ courses: await getStaffCourses(guard.identity.email) });
}
