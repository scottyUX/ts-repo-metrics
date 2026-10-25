import { NextResponse } from "next/server";
import { supabaseAnonKeyNode, supabaseProjectUrlNode } from "@/lib/supabase/projectEnv";

export const runtime = "nodejs";

export async function GET() {
  const url = supabaseProjectUrlNode();
  const key = supabaseAnonKeyNode();
  if (!url || !key) return NextResponse.json({ googleEnabled: false, reason: "Supabase is not configured." }, { status: 503 });
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`settings:${response.status}`);
    const settings = await response.json() as { external?: { google?: boolean } };
    return NextResponse.json({ googleEnabled: settings.external?.google === true });
  } catch {
    return NextResponse.json({ googleEnabled: null, reason: "Could not check sign-in availability." }, { status: 503 });
  }
}
