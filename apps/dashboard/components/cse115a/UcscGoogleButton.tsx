"use client";

import { useEffect, useState } from "react";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browserConfigured";
import { buildOAuthCallbackUrl, getOAuthRedirectOrigin, stashOAuthNextPath, stashOAuthProvider } from "@/lib/oauthRedirectOrigin";

export function UcscGoogleButton() {
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
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => void begin()} disabled={busy || googleEnabled !== true} className="w-full rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {busy ? "Opening Google…" : "Continue with UCSC Google"}
      </button>
      {googleEnabled === null ? <p className="text-sm text-slate-600">{availabilityError ? "Could not check Google sign in availability. Refresh and try again." : "Checking Google sign in availability…"}</p> : null}
      {googleEnabled === false ? <p className="text-sm text-amber-800">Google sign in needs to be enabled in Supabase before students can continue.</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
