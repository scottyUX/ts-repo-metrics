"use client";

import { cn } from "@/lib/utils";
import type { Phase2FunctionRow } from "@/lib/phase2Summary";

interface Phase2ComplexityImprovementSectionProps {
  topOutlier: Phase2FunctionRow | null;
  onOpenCodeQualityTab?: () => void;
  /** When false, per-function Halstead/cognitive/MI listing is unavailable — hide table jump link and adjust copy. */
  hasPerFunctionLexicalMetrics?: boolean;
  className?: string;
}

const linkButtonClass =
  "font-inherit text-primary underline-offset-4 hover:text-primary/90 hover:underline";

export function Phase2ComplexityImprovementSection({
  topOutlier,
  onOpenCodeQualityTab,
  hasPerFunctionLexicalMetrics = true,
  className,
}: Phase2ComplexityImprovementSectionProps) {
  const codeQualityControl =
    onOpenCodeQualityTab != null ? (
      <button type="button" onClick={onOpenCodeQualityTab} className={linkButtonClass}>
        Code Quality tab
      </button>
    ) : (
      <span className="text-primary">Code Quality tab</span>
    );

  const fn = topOutlier?.fn;
  const name = fn?.name ?? "your worst outlier";
  const vol = fn?.halstead?.volume;
  const cog = fn?.cognitiveComplexity;

  return (
    <section
      id="code-complexity-how-to-improve"
      aria-labelledby="code-complexity-how-to-improve-heading"
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-card-foreground shadow-md ring-1 ring-border/60 sm:p-6",
        className,
      )}
    >
      <h2
        id="code-complexity-how-to-improve-heading"
        className="text-lg font-semibold leading-6 tracking-tight text-foreground"
      >
        How to improve your Code Complexity score
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
          {!hasPerFunctionLexicalMetrics ? (
            <>
              Re-run analysis with the current engine to unlock per-function lexical and cognitive metrics on this tab.
              Until then, use the {codeQualityControl} for repo-wide complexity, length, and maintainability signals,
              then refactor the noisiest hotspots first.
            </>
          ) : (
            <>
              Simplify the <strong className="font-medium text-foreground">{name}</strong> function
              {vol !== undefined && cog !== undefined ? (
                <>
                  {" "}
                  — it has a Halstead volume of{" "}
                  <strong className="font-medium text-foreground">{vol.toFixed(1)}</strong> and cognitive complexity of{" "}
                  <strong className="font-medium text-foreground">{cog}</strong>. Break it into smaller focused
                  functions.
                </>
              ) : (
                <>
                  {" "}
                  — pick the hottest row under{" "}
                  <a href="#code-complexity-top-outliers" className={linkButtonClass}>
                    Top Complexity Outliers
                  </a>{" "}
                  earlier on this tab and split responsibilities into smaller functions.
                </>
              )}
            </>
          )}
        </p>
      </div>

      <p className="mt-6 text-xs font-normal uppercase leading-4 tracking-wide text-muted-foreground">
        When you&apos;re ready for more:
      </p>

      <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-[22px] text-muted-foreground marker:text-muted-foreground">
        {hasPerFunctionLexicalMetrics ? (
          <li>
            Review all functions with MI_norm below 50—your least maintainable units on a GRAD-AI-normalized scale.
          </li>
        ) : (
          <li>
            Prioritize files with high cyclomatic complexity or long functions—the {codeQualityControl} surfaces those
            counts repo-wide.
          </li>
        )}
        <li>
          Reduce nesting in the hardest-to-follow control flow—each level adds mental load for reviewers and future you.
        </li>
        <li>
          Keep functions focused on one task—smaller surface lowers lexical bulk and improves reviewability. Pair
          refactors with checks on the {codeQualityControl}.
        </li>
      </ol>

      {hasPerFunctionLexicalMetrics ? (
        <p className="mt-5">
          <a href="#per-function-metrics-table" className={cn("text-sm font-normal", linkButtonClass)}>
            → Explore all Code Complexity metrics in detail
          </a>
        </p>
      ) : null}
    </section>
  );
}
