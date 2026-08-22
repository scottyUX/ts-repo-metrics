"use client";

import { cn } from "@/lib/utils";
import type { ReactComponentMetrics } from "@/lib/reportTypes";

interface ReactComponentsImprovementSectionProps {
  topComponent: ReactComponentMetrics | null;
  /** Switch parent results tabs to Code Quality (structural metrics). */
  onOpenCodeQualityTab?: () => void;
  className?: string;
}

const linkButtonClass =
  "font-inherit text-primary underline-offset-4 hover:text-primary/90 hover:underline";

export function ReactComponentsImprovementSection({
  topComponent,
  onOpenCodeQualityTab,
  className,
}: ReactComponentsImprovementSectionProps) {
  const codeQualityControl =
    onOpenCodeQualityTab != null ? (
      <button type="button" onClick={onOpenCodeQualityTab} className={linkButtonClass}>
        Code Quality tab
      </button>
    ) : (
      <span className="text-primary">Code Quality tab</span>
    );

  const startName = topComponent?.name ?? "your largest component";
  const startLines = topComponent?.lines;

  return (
    <section
      id="react-components-how-to-improve"
      aria-labelledby="react-components-how-to-improve-heading"
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-card-foreground shadow-md ring-1 ring-border/60 sm:p-6",
        className,
      )}
    >
      <h2
        id="react-components-how-to-improve-heading"
        className="text-lg font-semibold leading-6 tracking-tight text-foreground"
      >
        How to improve React Components
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
          Open{" "}
          <strong className="font-medium text-foreground">
            {startName}
            {startLines != null ? ` (${startLines} SLOC)` : ""}
          </strong>{" "}
          from <strong className="font-medium text-foreground">Top Oversized Components</strong> above
          and extract presentation vs. state before adding more JSX.
        </p>
      </div>

      <p className="mt-6 text-xs font-normal uppercase leading-4 tracking-wide text-muted-foreground">
        When you&apos;re ready for more:
      </p>

      <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-[22px] text-muted-foreground marker:text-muted-foreground">
        <li>
          Reduce JSX nesting and file span until max depth and SLOC move out of the amber bands in the
          oversized table (see the tip line beneath it).
        </li>
        <li>
          Fix hook dependency hygiene: address missing or unstable deps flagged in Additional signals so
          effects don&apos;t mask stale bugs.
        </li>
        <li>
          Collapse prop pass-through chains by lifting shared state or using composition—pair large splits
          with tests on the {codeQualityControl} when behavior spans modules.
        </li>
      </ol>

      <p className="mt-5">
        <a href="#react-components-oversized" className={cn("text-sm font-normal", linkButtonClass)}>
          → Jump to Top Oversized Components
        </a>
      </p>
    </section>
  );
}
