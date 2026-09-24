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
