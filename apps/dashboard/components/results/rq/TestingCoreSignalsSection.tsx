"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RepoReport } from "@/lib/reportTypes";
import type { TestingScopeMetricValues } from "@/lib/testingScopeMetrics";
import {
  findContributorForScope,
  type CommitHabitsScopeId,
} from "@/lib/commitHabitsScopeMetrics";
import { cn } from "@/lib/utils";

interface TestingCoreSignalsSectionProps {
  mv: TestingScopeMetricValues;
  report: RepoReport;
  testingScopeId: CommitHabitsScopeId;
}

type SignalTier = "strong" | "good" | "needs_work" | "critical";

const tierMeta: Record<SignalTier, { label: string; badgeClass: string }> = {
  strong: {
    label: "Strong",
    badgeClass: "border-0 bg-emerald-950 font-medium text-green-400 shadow-none",
  },
  good: {
    label: "Good",
    badgeClass: "border-0 bg-emerald-950/90 font-medium text-green-400 shadow-none",
  },
  needs_work: {
    label: "Needs Work",
    badgeClass: "border-0 bg-amber-950 font-medium text-amber-400 shadow-none",
  },
  critical: {
    label: "Critical",
    badgeClass: "border-0 bg-red-950 font-medium text-red-400 shadow-none",
  },
};

function tierForTestLocRatio(ratio: number, sourceLoc: number): SignalTier {
  if (sourceLoc > 0 && ratio <= 0) return "critical";
  if (ratio < 0.08) return "critical";
  if (ratio < 0.15) return "needs_work";
  if (ratio < 0.3) return "good";
  return "strong";
}

function tierForPctCommits(pct: number): SignalTier {
  if (pct <= 0) return "critical";
  if (pct < 10) return "needs_work";
  if (pct < 25) return "good";
  return "strong";
}

function tierForTestFiles(files: number): SignalTier {
  if (files <= 0) return "critical";
  if (files < 36) return "needs_work";
  if (files < 100) return "good";
  return "strong";
}

/** Distinct test paths from git churn are usually much smaller than repo-wide test file counts. */
function tierForTestPathsFromChurn(paths: number): SignalTier {
  if (paths <= 0) return "critical";
  if (paths < 3) return "needs_work";
  if (paths < 12) return "good";
  return "strong";
}

function formatRatioAsPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${parseFloat((ratio * 100).toFixed(1))}%`;
}

function totalCommitsFromReport(report: RepoReport): number | null {
  const g = report.git?.totalCommits;
  if (typeof g === "number" && g > 0) return g;
  const cs = report.contributors?.map((c) => c.commitCount) ?? [];
  const sum = cs.reduce((a, b) => a + b, 0);
  return sum > 0 ? sum : null;
}

export function TestingCoreSignalsSection({
  mv,
  report,
  testingScopeId,
}: TestingCoreSignalsSectionProps) {
  const fromGitChurn = mv.locSource === "gitChurn";
  const ratioTier = tierForTestLocRatio(mv.testLocRatio, mv.sourceLoc);
  const pctTier = tierForPctCommits(mv.pctCommitsTouchingTests);
  const filesTier = fromGitChurn
    ? tierForTestPathsFromChurn(mv.testFiles)
    : tierForTestFiles(mv.testFiles);
  const totalCommits = totalCommitsFromReport(report);
  const commitsRounded = Number.isFinite(mv.pctCommitsTouchingTests)
    ? Math.round(mv.pctCommitsTouchingTests)
    : 0;

  const churnSharePct = Math.min(100, Math.max(0, Math.round(mv.testLocRatio * 100)));
  const snapshotSharePct = churnSharePct;

  const ratioTitle = fromGitChurn ? "Test churn share" : "Test coverage ratio";
  const testFilesTitle = fromGitChurn ? "Test paths touched" : "Test files";

  const ratioDescription = (() => {
    if (fromGitChurn) {
      if (ratioTier === "strong" || ratioTier === "good") {
        return `About ${churnSharePct}% of this author’s line churn (add + delete) landed on test paths—a healthy share for this git-history proxy. Keep pairing production edits with test updates when behavior changes.`;
      }
      return `Only about ${churnSharePct}% of this author’s line churn is on test paths. Aim to raise the share of test-path edits as features stabilize—same threshold idea as snapshot test/source ratio, but from numstat history.`;
    }
    if (ratioTier === "strong" || ratioTier === "good") {
      return `Test code is about ${snapshotSharePct}% of source in the snapshot—within a healthy band for this proxy. Keep pairing new features with tests so the ratio does not slip.`;
    }
    return `Test code is ${snapshotSharePct}% of source in the snapshot. Many teams aim for roughly 20–30% by LOC proxy; growing test files alongside features closes the gap.`;
  })();

  const commitsDescription = (() => {
    if (mv.mode === "contributor") {
      const phrase = authorCommitsPhrase(report, mv, testingScopeId);
      if (pctTier === "critical" && mv.pctCommitsTouchingTests <= 0) {
        return `None of ${phrase} included test file changes. Every feature shipped without a test is a future risk—this habit matters most.`;
      }
      if (pctTier === "needs_work") {
        return `Only about ${commitsRounded}% of ${phrase} touch tests. Aim to include at least one test change on most feature commits so verification keeps pace.`;
      }
      return `About ${commitsRounded}% of ${phrase} touch tests—solid habit. Watch for regressions if complexity grows without new checks.`;
    }
    const n = totalCommits;
    const commitPhrase = n != null ? `${n} commit${n === 1 ? "" : "s"}` : "your commits";
    if (pctTier === "critical" && mv.pctCommitsTouchingTests <= 0) {
      return `None of your ${commitPhrase} included test file changes. Every feature shipped without a test is a future risk. This is the most important habit to build.`;
    }
    if (pctTier === "needs_work") {
      return `Only about ${commitsRounded}% of ${commitPhrase} touch tests. Aim to include at least one test change on most feature commits so verification keeps pace.`;
    }
    return `About ${commitsRounded}% of ${commitPhrase} touch tests—solid habit. Watch for regressions if complexity grows without new checks.`;
  })();

  const filesDescription = (() => {
    if (fromGitChurn) {
      if (mv.testFiles <= 0) {
        return "No test paths matched the test-file pattern in this author’s parsed commits. A first step is touching an existing spec or adding one beside the next change.";
      }
      if (filesTier === "needs_work" || filesTier === "critical") {
        return "Few distinct test paths show up in this author’s history. As responsibilities grow, widen edits to include specs that lock behavior in.";
      }
      return `${mv.testFiles} distinct test path${mv.testFiles === 1 ? "" : "s"} in this author’s commits—keep expanding coverage as you ship.`;
    }
    if (mv.testFiles <= 0) {
      return "No test files matched the analyzer’s patterns yet. Add a first spec or test module so verification has a foothold in the tree.";
    }
    if (filesTier === "needs_work" || filesTier === "critical") {
      return `Only ${mv.testFiles} test file${mv.testFiles === 1 ? "" : "s"} on the snapshot. Add tests alongside new features so the count keeps pace with your source code.`;
    }
    return `You have ${mv.testFiles} test file${mv.testFiles === 1 ? "" : "s"} on the snapshot—keep adding tests as you ship so this count tracks code growth.`;
  })();

  return (
    <section
      aria-labelledby="testing-core-signals-heading"
      className="space-y-4"
      id="testing-core-signals"
    >
      <div>
        <h2 id="testing-core-signals-heading" className="text-sm font-medium tracking-wide text-muted-foreground">
          Core Signals
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SignalCard
          title={ratioTitle}
          tier={ratioTier}
          value={formatRatioAsPercent(mv.testLocRatio)}
          description={ratioDescription}
        />
        <SignalCard
          title="Commits touching tests"
          tier={pctTier}
          value={`${commitsRounded}%`}
          description={commitsDescription}
        />
        <SignalCard
          title={testFilesTitle}
          tier={filesTier}
          value={`${mv.testFiles} ${fromGitChurn ? "path" : "file"}${mv.testFiles === 1 ? "" : "s"}`}
          description={filesDescription}
        />
      </div>
    </section>
  );
}

function authorCommitsPhrase(
  report: RepoReport,
  mv: TestingScopeMetricValues,
  testingScopeId: CommitHabitsScopeId,
): string {
  const label = mv.contributorDisplayName?.trim() || "this contributor";
  const row = findContributorForScope(report, testingScopeId);
  const n = row?.commitCount;
  if (typeof n === "number" && n > 0) {
    return `${n} commit${n === 1 ? "" : "s"} for ${label}`;
  }
  return `${label}’s commits in this analysis`;
}

function SignalCard({
  title,
  tier,
  value,
  description,
}: {
  title: string;
  tier: SignalTier;
  value: string;
  description: string;
}) {
  const t = tierMeta[tier];
  return (
    <Card className="flex flex-col overflow-hidden border-border/80 bg-card shadow-sm outline-none focus-visible:outline-none">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-snug">{title}</CardTitle>
          <Badge variant="outline" className={cn("shrink-0", t.badgeClass)}>
            {t.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 pt-0">
        <p className="text-[2rem] font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-4xl">
          {value}
        </p>
        <CardDescription className="text-sm leading-snug text-muted-foreground">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
