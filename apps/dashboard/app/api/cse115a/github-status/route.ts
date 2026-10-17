import { NextResponse } from "next/server";
import { getCourseIdentity } from "@/lib/cse115a/server";
import { githubAppInstallUrl } from "@/lib/cse115a/githubApp";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Whether the student linked a GitHub account, and where their team installs the course GitHub App. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  const identity = await getCourseIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in with UCSC Google." }, { status: 401 });
  return NextResponse.json({ connected: Boolean(identity.githubLogin), login: identity.githubLogin, installUrl: githubAppInstallUrl() });
}
