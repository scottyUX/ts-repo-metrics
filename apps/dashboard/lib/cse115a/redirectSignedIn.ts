import { redirect } from "next/navigation";
import {
  createUserSupabaseServerClient,
  isUserSupabaseConfigured,
} from "@/lib/supabase/server-user";

/** Signed-in students already have a dashboard. The landing page is only the entry point. */
export async function redirectCse115aSignedInUser() {
  if (!isUserSupabaseConfigured()) return;
  const supabase = await createUserSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/cse115a/dashboard");
}
