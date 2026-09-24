import { createClient } from "@supabase/supabase-js";

const [slug, rawEmail, role = "instructor"] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!slug || !email || !url || !serviceKey || !["instructor", "ta"].includes(role)) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node apps/dashboard/scripts/addCourseStaff.mjs COURSE_SLUG EMAIL [instructor|ta]");
  process.exit(1);
}
if (!/^[a-z0-9._%+-]+@ucsc\.edu$/.test(email)) {
  console.error("Staff sign in with UCSC Google, so the email must end in @ucsc.edu.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: course, error: courseError } = await db.from("cse_courses")
  .select("id,title,term").eq("slug", slug).maybeSingle();
if (courseError || !course) {
  console.error("Course not found. Apply the course migration or check the slug.");
  process.exit(1);
}
const { error } = await db.from("cse_course_roles").upsert({ course_id: course.id, email, role }, { onConflict: "course_id,email" });
if (error) {
  console.error("Could not add staff:", error.message);
  process.exit(1);
}
console.log(`${email} is now ${role === "ta" ? "a TA" : "an instructor"} for ${course.title} · ${course.term}.`);
