"use client";

/**
 * Shared landing block: URL input, sample repo, and copy for analyze flows.
 * Dashboard analyze requires a signed-in GitHub session (cookies).
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Github, ArrowRight, Loader2 } from "lucide-react";
import { isValidGitHubUrl } from "@/lib/githubUrl";
import {
  ANALYZE_SIGN_IN_REQUIRED_MESSAGE,
  runAnalyzeFromUrl,
} from "@/lib/runAnalyze";
import { Button } from "@/components/ui/button";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browserConfigured";
import {
  buildOAuthCallbackUrl,
  getOAuthRedirectOrigin,
  stashOAuthNextPath,
} from "@/lib/oauthRedirectOrigin";

const EXAMPLE_GITHUB_REPO = "https://github.com/scottyUX/ts-repo-metrics";

export type AnalyzeRepositoryHeroProps = {
  /** When true, omit tall min-height (e.g. on /repos above the repo grid). */
  compact?: boolean;
};

export function AnalyzeRepositoryHero({ compact }: AnalyzeRepositoryHeroProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** null = resolving session */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!isBrowserSupabaseConfigured()) {
      setSignedIn(false);
      return;
    }
    const supabase = createUserSupabaseBrowserClient();
    const sync = () => {
      void supabase.auth.getUser().then(({ data }) => {
        setSignedIn(Boolean(data.user));
      });
    };
    sync();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      sync();
    });
    return () => subscription.unsubscribe();
  }, []);

  const signInHrefPath = "/";

  const handleSignIn = useCallback(async () => {
    if (!isBrowserSupabaseConfigured()) {
      toast.error("Sign-in is not configured on this host.");
      return;
    }
    setSigningIn(true);
    try {
      const supabase = createUserSupabaseBrowserClient();
      const origin = getOAuthRedirectOrigin();
      stashOAuthNextPath(signInHrefPath);
      await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: buildOAuthCallbackUrl(origin),
          scopes: "read:user user:email repo",
        },
      });
    } finally {
      setSigningIn(false);
    }
  }, []);

  const valid = isValidGitHubUrl(url);

  const runAnalysisForUrl = useCallback(
    async (rawUrl: string) => {
      if (loading || signedIn !== true) return;
      if (!isValidGitHubUrl(rawUrl)) {
        setError("Enter a valid GitHub repository URL");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await runAnalyzeFromUrl(rawUrl);
        if (!result.ok) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success("Analysis complete");
        router.push(`/r/${encodeURIComponent(result.resultId)}`);
      } catch {
        setError("Analysis failed. Please try again.");
        toast.error("Analysis failed");
      } finally {
        setLoading(false);
      }
    },
    [loading, router, signedIn],
  );

  const runAnalysis = useCallback(() => {
    if (!valid || loading || signedIn !== true) return;
    void runAnalysisForUrl(url);
  }, [url, valid, loading, signedIn, runAnalysisForUrl]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runAnalysis();
  }

  const supabaseOk = isBrowserSupabaseConfigured();
  const gated = signedIn !== true || !supabaseOk;

  return (
    <div
      className={
        compact
          ? "flex w-full max-w-3xl flex-col items-center space-y-6"
          : "flex w-full max-w-3xl flex-col items-center space-y-6 pt-10 pb-4"
      }
    >
      <div className="flex justify-center">
        <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
          Static analysis for TypeScript, JavaScript, Python, and more
        </span>
      </div>

      <div className="space-y-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl xl:text-7xl">
          <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
            Analyze your repository
          </span>
        </h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Enter a GitHub URL for complexity, maintainability, duplication, and git behavior
          metrics. You must{" "}
          <strong className="font-medium text-foreground">sign in with GitHub</strong> to run an
          analysis (public and private repos).
        </p>
      </div>

      {signedIn === null && supabaseOk ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Checking sign-in…</p>
        </div>
      ) : null}

      {!supabaseOk ? (
        <p className="max-w-md text-center text-sm text-destructive">
          This deployment is missing Supabase URL and anon key. Configure{" "}
          <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable
          sign-in and analysis.
        </p>
      ) : null}

      {supabaseOk && signedIn === false ? (
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            Sign in with GitHub to analyze a repository. By using Repo Metrics, you agree to its{" "}
            <a href="/license" className="underline underline-offset-4 hover:text-foreground">license</a>{" "}
            and{" "}
            <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">privacy statement</a>.
          </p>
          <Button
            type="button"
            onClick={() => void handleSignIn()}
            disabled={signingIn}
            className="gap-2"
          >
            {signingIn ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Github className="size-4" aria-hidden />
            )}
            Sign in with GitHub
          </Button>
        </div>
      ) : null}

      {/* URL input form — only shown when signed in */}
      {signedIn === true ? (
        <>
          <form onSubmit={handleSubmit} className="w-full">
            <div className="flex h-[60px] w-full overflow-hidden rounded-xl border border-neutral-200 bg-white focus-within:ring-2 focus-within:ring-neutral-400 focus-within:ring-offset-2 focus-within:ring-offset-background dark:border-neutral-700 dark:bg-neutral-900/50 dark:focus-within:ring-neutral-600">
              <div className="flex items-center justify-center pl-4 text-neutral-400">
                <Github className="size-5" />
              </div>
              <input
                type="text"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3 py-0 text-base outline-none placeholder:text-neutral-400"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!valid || loading}
                className="flex h-full shrink-0 items-center justify-center gap-2 bg-neutral-900 px-6 font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {loading ? "Analyzing…" : "Go"}
                <ArrowRight className="size-4" />
              </button>
            </div>
          </form>

          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">or try an example</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setUrl(EXAMPLE_GITHUB_REPO);
                void runAnalysisForUrl(EXAMPLE_GITHUB_REPO);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <Github className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>Try sample repo</span>
            </button>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Or open <strong className="text-foreground">My Repos</strong> to pick from your GitHub
            repositories.
          </p>

          {url && !valid && (
            <p className="text-center text-sm text-destructive">
              Enter a valid GitHub repository URL
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
              <p className="text-sm text-destructive">{error}</p>
              {error !== ANALYZE_SIGN_IN_REQUIRED_MESSAGE ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    runAnalysis();
                  }}
                  className="mt-2 text-sm font-medium underline hover:no-underline"
                >
                  Retry
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
