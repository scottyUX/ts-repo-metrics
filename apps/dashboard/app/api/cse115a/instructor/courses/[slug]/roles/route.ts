import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { guardCourse } from "@/lib/cse115a/instructorApi";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

const UCSC_EMAIL = /^[a-z0-9._%+-]+@ucsc\.edu$/;

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug);
  if ("response" in guard) return guard.response;
  const { data, error } = await getSupabase().from("cse_course_roles")
    .select("email,role,created_at").eq("course_id", guard.course.id).order("role").order("email");
  if (error) return NextResponse.json({ error: "Could not load staff." }, { status: 500 });
  return NextResponse.json({ course: guard.course, staff: data, me: guard.identity.email });
}

/** Adds or changes a staff member. Instructors only. */
export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug, { instructorOnly: true });
  if ("response" in guard) return guard.response;
  const body = await request.json().catch(() => null) as { email?: unknown; role?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body?.role;
  if (!UCSC_EMAIL.test(email)) return NextResponse.json({ error: "Enter a @ucsc.edu email." }, { status: 400 });
  if (role !== "instructor" && role !== "ta") return NextResponse.json({ error: "Role must be instructor or ta." }, { status: 400 });
  if (email === guard.identity.email.toLowerCase() && role !== "instructor") {
    return NextResponse.json({ error: "You cannot remove your own instructor role." }, { status: 400 });
  }
  const { error } = await getSupabase().from("cse_course_roles")
    .upsert({ course_id: guard.course.id, email, role }, { onConflict: "course_id,email" });
  if (error) return NextResponse.json({ error: "Could not save staff." }, { status: 500 });
  return NextResponse.json({ email, role });
}

/** Removes a staff member (`?email=`). Instructors only; you cannot remove yourself. */
export async function DELETE(request: Request, { params }: Params) {
  const { slug } = await params;
  const guard = await guardCourse(slug, { instructorOnly: true });
  if ("response" in guard) return guard.response;
  const email = (new URL(request.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Give an email." }, { status: 400 });
  if (email === guard.identity.email.toLowerCase()) return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
  const { error } = await getSupabase().from("cse_course_roles").delete().eq("course_id", guard.course.id).eq("email", email);
  if (error) return NextResponse.json({ error: "Could not remove staff." }, { status: 500 });
  return NextResponse.json({ removed: email });
}
