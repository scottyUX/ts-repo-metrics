"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitBranch, GitPullRequest, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { runAnalyzeFromUrl, type AnalyzeRequestBody } from "@/lib/runAnalyze";
import type { AnalyzeRef, RepoTargets } from "@/lib/github/analyzeRef";

export type AnalyzePickerRepo = {
  name: string;
  fullName: string;
  htmlUrl: string;
};

type AnalyzeTargetPickerProps = {
  repo: AnalyzePickerRepo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extra?: Omit<AnalyzeRequestBody, "url" | "ref">;
  onAnalyzingChange?: (fullName: string | null) => void;
};

export function AnalyzeTargetPicker({
  repo,
  open,
  onOpenChange,
  extra,
  onAnalyzingChange,
}: AnalyzeTargetPickerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<RepoTargets | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open || !repo) {
      setTargets(null);
      setError(null);
      return;
    }
    const [owner, name] = repo.fullName.split("/");
    if (!owner || !name) {
      setError("Invalid repository name.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/targets`,
          { credentials: "include" },
        );
        const body = (await res.json()) as RepoTargets & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load pull requests and branches.");
          setTargets(null);
          return;
        }
        setTargets(body);
      } catch {
        if (!cancelled) {
          setError("Failed to load pull requests and branches.");
          setTargets(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, repo]);

  async function start(ref: AnalyzeRef) {
    if (!repo || starting) return;
    setStarting(true);
    onAnalyzingChange?.(repo.fullName);
    onOpenChange(false);
    try {
      const result = await runAnalyzeFromUrl(repo.htmlUrl, { ...extra, ref });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Analysis complete");
      router.push(`/r/${encodeURIComponent(result.resultId)}`);
    } finally {
      setStarting(false);
      onAnalyzingChange?.(null);
    }
  }

  const defaultBranch = targets?.defaultBranch ?? "main";
  const otherBranches =
    targets?.branches.filter((b) => b.name !== defaultBranch) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose what to analyze</DialogTitle>
          <DialogDescription>
            {repo
              ? `${repo.fullName} — a pull request uses changed files only; a branch analyzes the full tree.`
              : "Select a pull request or branch."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading pull requests and branches…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : targets ? (
          <div className="space-y-6">
            <div>
              <Button
                type="button"
                className="w-full"
                onClick={() => void start({ type: "default" })}
              >
                Analyze {defaultBranch} (full repository)
              </Button>
            </div>

            <TargetList
              title="Open pull requests"
              empty="No open pull requests."
              icon={<GitPullRequest className="size-3.5" aria-hidden />}
            >
              {targets.openPulls.map((p) => (
                <TargetRow
                  key={`open-${p.number}`}
                  label={`#${p.number} ${p.title}`}
                  hint={`${p.headRef} → ${p.baseRef}`}
                  onClick={() => void start({ type: "pr", prNumber: p.number })}
                />
              ))}
            </TargetList>

            <TargetList
              title="Closed pull requests"
              empty="No closed pull requests."
              icon={<GitPullRequest className="size-3.5" aria-hidden />}
            >
              {targets.closedPulls.map((p) => (
                <TargetRow
                  key={`closed-${p.number}`}
                  label={`#${p.number} ${p.title}`}
                  hint={`${p.headRef} → ${p.baseRef}`}
                  onClick={() => void start({ type: "pr", prNumber: p.number })}
                />
              ))}
            </TargetList>

            <TargetList
              title="Other branches"
              empty="No other branches."
              icon={<GitBranch className="size-3.5" aria-hidden />}
            >
              {otherBranches.map((b) => (
                <TargetRow
                  key={b.name}
                  label={b.name}
                  onClick={() => void start({ type: "branch", branch: b.name })}
                />
              ))}
            </TargetList>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TargetList({
  title,
  empty,
  icon,
  children,
}: {
  title: string;
  empty: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  const hasItems = items.length > 0;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {icon}
        {title}
      </h3>
      {hasItems ? (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {children}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function TargetRow({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/60"
      >
        <span className="line-clamp-2 font-medium text-foreground">{label}</span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </button>
    </li>
  );
}
