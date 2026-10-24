"use client";

import { useEffect, useState } from "react";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browserConfigured";
import { buildOAuthCallbackUrl, getOAuthRedirectOrigin, stashOAuthNextPath, stashOAuthProvider } from "@/lib/oauthRedirectOrigin";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5 shrink-0">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.6 7.1l6.3 5.3C37.4 38.3 44 34 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

export function UcscGoogleButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/cse115a/auth-availability")
      .then((response) => response.json())
      .then((body: { googleEnabled?: boolean | null }) => {
        if (active) setGoogleEnabled(body.googleEnabled ?? null);
      })
      .catch(() => { if (active) setAvailabilityError(true); });
    return () => { active = false; };
  }, []);
  async function begin() {
    if (googleEnabled !== true) {
      setError("UCSC Google sign in has not been enabled for this preview yet.");
      return;
    }
    if (!isBrowserSupabaseConfigured()) {
      setError("Sign in is not configured for this preview.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createUserSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      stashOAuthNextPath("/cse115a/dashboard");
      stashOAuthProvider("google");
      const options = {
        redirectTo: buildOAuthCallbackUrl(getOAuthRedirectOrigin()),
        queryParams: { hd: "ucsc.edu", prompt: "select_account" },
      };
      const result = user?.identities?.some((identity) => identity.provider === "google")
        ? await supabase.auth.signInWithOAuth({ provider: "google", options })
        : user
          ? await supabase.auth.linkIdentity({ provider: "google", options })
          : await supabase.auth.signInWithOAuth({ provider: "google", options });
      if (result.error) setError(result.error.message);
    } catch {
      setError("Could not start Google sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const statusClass = fullWidth ? "text-sm text-slate-600" : "text-sm text-muted-foreground";
  return (
    <div className={fullWidth ? "space-y-3" : "space-y-3 text-center"}>
      <button type="button" onClick={() => void begin()} disabled={busy || googleEnabled !== true} className={`${fullWidth ? "flex w-full" : "inline-flex"} items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50`}>
        <GoogleMark />
        {busy ? "Opening Google…" : "Continue with UCSC Google"}
      </button>
      {googleEnabled === null ? <p className={statusClass}>{availabilityError ? "Could not check Google sign in availability. Refresh and try again." : "Checking Google sign in availability…"}</p> : null}
      {googleEnabled === false ? <p className={fullWidth ? "text-sm text-amber-800" : "text-sm text-amber-700 dark:text-amber-300"}>Google sign in needs to be enabled in Supabase before students can continue.</p> : null}
      {error ? <p role="alert" className={fullWidth ? "text-sm text-red-700" : "text-sm text-red-600 dark:text-red-400"}>{error}</p> : null}
    </div>
  );
}
