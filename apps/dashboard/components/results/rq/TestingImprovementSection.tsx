"use client";

import { cn } from "@/lib/utils";
import type { TestingScopeMetricValues } from "@/lib/testingScopeMetrics";

interface TestingImprovementSectionProps {
  mv: TestingScopeMetricValues;
  /** Switch parent results tabs to Code Quality (hotspot metrics). */
  onOpenCodeQualityTab?: () => void;
  className?: string;
}

const linkButtonClass =
  "font-inherit text-primary underline-offset-4 hover:text-primary/90 hover:underline";

export function TestingImprovementSection({
  mv,
  onOpenCodeQualityTab,
  className,
}: TestingImprovementSectionProps) {
  const codeQualityTabControl =
    onOpenCodeQualityTab != null ? (
      <button type="button" onClick={onOpenCodeQualityTab} className={linkButtonClass}>
        Code Quality tab
      </button>
    ) : (
      <span className="text-primary">Code Quality tab</span>
    );

  const isContributor = mv.mode === "contributor";
  const who = (mv.contributorDisplayName?.trim() || "This contributor").replace(/\s+/g, " ");
  const pctCommits = Number.isFinite(mv.pctCommitsTouchingTests)
    ? Math.round(mv.pctCommitsTouchingTests)
    : 0;

  const title = isContributor
    ? `How to improve testing for ${who}`
    : "How to improve your testing score";

  const startHere = `Add one test file alongside the next feature commit.`;

  const readyLabel = "When you're ready for more:";

  const listItems = isContributor
    ? [
        <>
          Strengthen tests around the riskiest changes — use the {codeQualityTabControl} for repo-wide
          complexity hotspots (same scan for everyone).
        </>,
        <>
          Aim for at least 30% of {who}&apos;s commits to include test file changes this sprint
          {pctCommits > 0 ? ` (about ${pctCommits}% touch tests in this analysis).` : "."}
        </>,
        <>
          Review tests on paths this author changes often and extend coverage when behavior shifts.
        </>,
      ]
    : [
        <>
          Write a test for your most complex function — find it in the {codeQualityTabControl}.
        </>,
        <>Aim for at least 30% of your commits to include test file changes this sprint.</>,
        <>Review your existing test files and check they still cover recent features.</>,
      ];

  return (
    <section
      id="testing-how-to-improve"
      aria-labelledby="testing-how-to-improve-heading"
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-card-foreground shadow-md ring-1 ring-border/60 sm:p-6",
        className,
      )}
    >
      <h2
        id="testing-how-to-improve-heading"
        className="text-lg font-semibold leading-6 tracking-tight text-foreground"
      >
        {title}
      </h2>

      {isContributor ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Coaching ideas for this person&apos;s commit patterns in this run. Metrics above mix their
          history with repo-wide scans where noted.
        </p>
      ) : null}

      <div
        className={cn(
          "mt-4 rounded-lg border border-border bg-card px-4 py-3 sm:px-5 sm:py-4",
        )}
      >
        <p className="text-[11px] font-normal uppercase leading-normal tracking-wide text-primary">
          Start here
        </p>
        <p className="mt-3 text-sm font-normal leading-5 text-foreground">{startHere}</p>
      </div>

      <p className="mt-6 text-xs font-normal uppercase leading-4 tracking-wide text-muted-foreground">
        {readyLabel}
      </p>

      <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-[22px] text-muted-foreground marker:text-muted-foreground">
        {listItems.map((child, i) => (
          <li key={i}>{child}</li>
        ))}
      </ol>

      <p className="mt-5">
        <a href="#testing-safety-nets" className={cn("text-sm font-normal", linkButtonClass)}>
          → Explore all Testing metrics in detail
        </a>
      </p>
    </section>
  );
}
