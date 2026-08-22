"use client";

import { cn } from "@/lib/utils";

interface CodeQualityImprovementSectionProps {
  /** Switch parent results tabs to Testing (verification metrics). */
  onOpenTestingTab?: () => void;
  className?: string;
}

const linkButtonClass =
  "font-inherit text-primary underline-offset-4 hover:text-primary/90 hover:underline";

export function CodeQualityImprovementSection({
  onOpenTestingTab,
  className,
}: CodeQualityImprovementSectionProps) {
  const testingTabControl =
    onOpenTestingTab != null ? (
      <button type="button" onClick={onOpenTestingTab} className={linkButtonClass}>
        Testing tab
      </button>
    ) : (
      <span className="text-primary">Testing tab</span>
    );

  return (
    <section
      id="code-quality-how-to-improve-quality"
      aria-labelledby="code-quality-how-to-improve-quality-heading"
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-card-foreground shadow-md ring-1 ring-border/60 sm:p-6",
        className,
      )}
    >
      <h2
        id="code-quality-how-to-improve-quality-heading"
        className="text-lg font-semibold leading-6 tracking-tight text-foreground"
      >
        How to improve your Code Quality score
      </h2>

      <div
        className={cn(
          "mt-4 rounded-lg border border-border bg-card px-4 py-3 sm:px-5 sm:py-4",
        )}
      >
        <p className="text-[11px] font-normal uppercase leading-normal tracking-wide text-primary">
          Start here
        </p>
        <p className="mt-3 text-sm font-normal leading-5 text-foreground">
          Open the worst function in{" "}
          <strong className="font-medium text-foreground">Top by complexity</strong> below and split it
          into smaller units.
        </p>
      </div>

      <p className="mt-6 text-xs font-normal uppercase leading-4 tracking-wide text-muted-foreground">
        When you&apos;re ready for more:
      </p>

      <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-[22px] text-muted-foreground marker:text-muted-foreground">
        <li>
          Tackle the top five hotspots in the complexity distribution section—each reduction lowers
          review load across the team.
        </li>
        <li>
          Add or strengthen tests for refactors you make (see the {testingTabControl}) so behavior
          stays pinned when complexity drops.
        </li>
        <li>
          Re-run analysis after a milestone and compare maintainability and duplication to this run.
        </li>
      </ol>

      <p className="mt-5">
        <a href="#code-quality-hotspots" className={cn("text-sm font-normal", linkButtonClass)}>
          → Explore all Code Quality metrics in detail
        </a>
      </p>
    </section>
  );
}
