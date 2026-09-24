"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browserConfigured";

export function Cse115aHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const resultsPage = pathname === "/cse115a/preview" || pathname === "/cse115a/dashboard" || pathname === "/cse115a/preview/results" || /^\/cse115a\/assignments\/\d+\/tasks\/[12]\/metrics$/.test(pathname) || pathname.startsWith("/cse115a/instructor");
  const [signedIn, setSignedIn] = useState(false);
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    if (!isBrowserSupabaseConfigured()) return;
    const supabase = createUserSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session?.user)));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void fetch("/api/cse115a/instructor/courses", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { courses: [] }))
      .then((body: { courses?: unknown[] }) => { if (!cancelled) setStaff(Boolean(body.courses?.length)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [signedIn]);
  async function signOut() {
    if (isBrowserSupabaseConfigured()) await createUserSupabaseBrowserClient().auth.signOut();
    router.push("/cse115a");
    router.refresh();
  }
  return (
    <header className={`w-full border-b ${resultsPage ? "border-border bg-muted text-foreground" : "border-emerald-900/10 bg-white text-slate-900"}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/cse115a" className="text-base font-bold tracking-tight">CSE 115A <span className={resultsPage ? "text-primary" : "text-emerald-700"}>Repo Metrics</span></Link>
        <nav className="flex items-center gap-4 text-sm font-medium" aria-label="Account">
          {signedIn ? (
            <><Link href="/cse115a/dashboard" className="hover:text-emerald-700">Assignments</Link>{staff ? <Link href="/cse115a/instructor" className="hover:text-emerald-700">Instructor</Link> : null}<button type="button" onClick={() => void signOut()} className="hover:text-emerald-700">Sign out</button></>
          ) : (
            <><Link href="/cse115a/signin" className="hover:text-emerald-700">Sign in</Link><Link href="/cse115a/signup" className="rounded-lg bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800">Sign up</Link></>
          )}
        </nav>
      </div>
    </header>
  );
}
