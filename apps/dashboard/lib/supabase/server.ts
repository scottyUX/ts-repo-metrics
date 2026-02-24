/**
 * Supabase server client for API routes.
 * Uses service role key — never expose to client. Keep SUPABASE_SERVICE_ROLE_KEY server-only.
 * Lazy init so build can succeed without env vars; throws when first used if vars are missing.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing Supabase env vars");
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}
