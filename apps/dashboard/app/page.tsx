"use client";

/**
 * Landing page: paste GitHub repo URL to analyze.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Github, ArrowRight } from "lucide-react";
import { isValidGitHubUrl, normalizeGitHubUrl } from "@/lib/githubUrl";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const valid = isValidGitHubUrl(url);

  const runAnalysis = useCallback(async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizeGitHubUrl(url) }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.error ?? "Analysis failed";
        setError(err);
        toast.error(err);
        return;
      }
      toast.success("Analysis complete");
      router.push(`/r/${data.resultId}`);
    } catch {
      setError("Analysis failed. Please try again.");
      toast.error("Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [url, valid, loading, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runAnalysis();
  }

  return (
    <div className="w-full max-w-[700px] flex flex-col items-center justify-center space-y-10 min-h-[60vh]">
      {/* Pill */}
      <div className="flex justify-center">
        <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
          Static analysis for TypeScript repositories
        </span>
      </div>

      {/* Headline */}
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Analyze public TypeScript repositories
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Enter a GitHub URL to run cyclomatic complexity, function metrics,
          maintainability, and git behavior analysis.
        </p>
      </div>

      {/* Input + Go button (inline, github.gg style) */}
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex w-full h-[60px] rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/50 overflow-hidden focus-within:ring-2 focus-within:ring-neutral-400 focus-within:ring-offset-2 focus-within:ring-offset-background dark:focus-within:ring-neutral-600">
          <div className="flex items-center justify-center pl-4 text-neutral-400">
            <Github className="size-5" />
          </div>
          <input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 min-w-0 bg-transparent px-3 py-0 text-base placeholder:text-neutral-400 outline-none disabled:opacity-50"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!valid || loading}
            className="flex items-center justify-center gap-2 shrink-0 h-full px-6 bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {loading ? "Analyzing…" : "Go"}
            <ArrowRight className="size-4" />
          </button>
        </div>
      </form>

      {/* Footer */}
      <p className="text-center text-sm text-muted-foreground">
        Accepts public GitHub TypeScript repositories
      </p>

      {url && !valid && (
        <p className="text-center text-sm text-destructive">
          Enter a valid GitHub repository URL
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
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
        </div>
      )}
    </div>
  );
}
