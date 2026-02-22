"use client";

/**
 * Landing page: analyze a public GitHub repo by URL.
 * Uses shadcn Input + Button (Aceternity-compatible primitives).
 * @see https://ui.aceternity.com/components — Aceternity UI
 * @see https://ui.shadcn.com/docs/components/input — shadcn Input
 * @see https://ui.shadcn.com/docs/components/button — shadcn Button
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidGitHubUrl, normalizeGitHubUrl } from "@/lib/githubUrl";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const valid = isValidGitHubUrl(url);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizeGitHubUrl(url) }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Analysis failed");
        return;
      }

      toast.success("Analysis complete");
      router.push(`/r/${data.resultId}`);
    } catch {
      toast.error("Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Repo Metrics
        </h1>
        <p className="text-muted-foreground">
          Analyze TypeScript repositories. Paste a public GitHub URL below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row">
        <Input
          type="text"
          placeholder="https://github.com/owner/repo or github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
          disabled={loading}
        />
        <Button
          type="submit"
          disabled={!valid || loading}
          className="shrink-0"
        >
          {loading ? "Analyzing…" : "Analyze"}
        </Button>
      </form>

      {url && !valid && (
        <p className="text-sm text-destructive">
          Enter a valid GitHub URL (e.g. https://github.com/owner/repo)
        </p>
      )}
    </div>
  );
}
