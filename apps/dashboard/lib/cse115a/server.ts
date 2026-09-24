import "server-only";
import { createUserSupabaseServerClient } from "@/lib/supabase/server-user";
import { getSupabase } from "@/lib/supabase/server";
import { verifiedUcscGoogleEmail } from "@/lib/courseUcscAuth";

export type CourseIdentity = { userId: string; email: string };
export type Course = { id: string; slug: string; title: string; term: string; assignment_count: number; active: boolean };

export async function getCourseIdentity(): Promise<CourseIdentity | null> {
  const supabase = await createUserSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = verifiedUcscGoogleEmail(user);
  return user && email ? { userId: user.id, email } : null;
}

export async function getEnrolledCourse(userId: string, slug: string): Promise<Course | null> {
  const { data: course, error } = await getSupabase()
    .from("cse_courses")
    .select("id,slug,title,term,assignment_count,active")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !course || !course.active) return null;
  const { data: membership } = await getSupabase()
    .from("cse_course_memberships")
    .select("course_id")
    .eq("course_id", course.id)
    .eq("user_id", userId)
    .maybeSingle();
  return membership ? course as Course : null;
}

export type AssignmentSubmissionStatus = "submitted" | "grading" | "graded" | "released" | "grading_failed";
export const ASSIGNMENT_SUBMISSION_COLUMNS = "id,course_id,assignment_number,attempt,status,submitted_at";

/** The student's current final submission for an assignment, if any. While it exists the tasks are locked. */
export async function getActiveAssignmentSubmission(courseId: string, userId: string, assignmentNumber: number) {
  const { data, error } = await getSupabase()
    .from("cse_assignment_submissions")
    .select(ASSIGNMENT_SUBMISSION_COLUMNS)
    .eq("course_id", courseId).eq("user_id", userId).eq("assignment_number", assignmentNumber)
    .is("superseded_at", null)
    .maybeSingle();
  if (error) throw new Error("Could not check the assignment submission.");
  return data as { id: string; course_id: string; assignment_number: number; attempt: number; status: AssignmentSubmissionStatus; submitted_at: string } | null;
}

export function lockedAssignmentMessage(assignmentNumber: number): string {
  return `Assignment ${assignmentNumber} is already submitted, so its tasks are locked. Ask your instructor if something needs to change.`;
}
