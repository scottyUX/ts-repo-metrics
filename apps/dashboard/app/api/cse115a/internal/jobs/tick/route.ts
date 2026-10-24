import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { runJobsOnce } from "@/lib/cse115a/jobs/worker";

export const runtime = "nodejs";

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Runs queued CSE 115A jobs now, for tests or an external cron. */
export async function POST(request: Request) {
  const expected = process.env.CSE115A_WORKER_SECRET?.trim();
  if (!expected) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!secretMatches(request.headers.get("x-cse115a-worker-secret"), expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Course storage is not configured." }, { status: 503 });
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 1, 1), 10);
  const results = await runJobsOnce(limit);
  return NextResponse.json({ ran: results.length, results });
}
