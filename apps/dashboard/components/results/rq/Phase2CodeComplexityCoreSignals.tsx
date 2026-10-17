"use client";

import type { Phase2Summary } from "@/lib/phase2Summary";
import { CoreSignalCard, type CoreSignalTier } from "./CoreSignalsPrimitives";
import type { Phase2DeepDiveId } from "./Phase2MetricDeepDiveDialog";

interface Phase2CodeComplexityCoreSignalsProps {
  summary: Phase2Summary;
  onOpenDeepDive?: (id: Phase2DeepDiveId) => void;
  prScoped?: boolean;
}

function formatMiMean(m: number): string {
  return m.toFixed(1);
}

function formatCogMean(m: number): string {
  return m.toFixed(2);
}

function formatHalMean(m: number): string {
  return m.toFixed(1);
}

/** Repo-level mean MI_norm: ≥65 maintainable band. */
function tierMiMeanValue(m: number): CoreSignalTier {
  if (m >= 70) return "strong";
  if (m >= 55) return "good";
  if (m >= 45) return "needs_work";
  return "critical";
}

/** Lower average cognitive is better. */
function tierCognitiveMean(m: number): CoreSignalTier {
  if (m <= 5) return "strong";
  if (m <= 10) return "good";
  if (m <= 15) return "needs_work";
  return "critical";
}

/** Higher mean Halstead volume is harder; compare to p90 implicitly via thresholds. */
function tierHalsteadMean(m: number): CoreSignalTier {
  if (m <= 100) return "strong";
  if (m <= 140) return "good";
  if (m <= 220) return "needs_work";
  return "critical";
}

export function Phase2CodeComplexityCoreSignals({
  summary,
  onOpenDeepDive,
  prScoped,
}: Phase2CodeComplexityCoreSignalsProps) {
  const mi = summary.miNormMean;
  const cog = summary.cognitiveMean;
  const hal = summary.halsteadVolMean;
  const p90h = summary.halsteadVolP90;

  const tMi = tierMiMeanValue(mi);
  const tCog = tierCognitiveMean(cog);
  const tHal = tierHalsteadMean(hal);

  const descMi = (() => {
    if (tMi === "strong" || tMi === "good") {
      return `Above 65 is considered maintainable. ${prScoped ? "The average for this pull request's files" : "Your codebase average"} is ${formatMiMean(mi)}—protect this by keeping complexity in check.`;
    }
    return `Mean MI_norm ${formatMiMean(mi)} sits below the maintainable band for many functions—prioritize outliers in the tables below.`;
  })();

  const descCog = (() => {
    if (tCog === "strong" || tCog === "good") {
      return `Average cognitive complexity of ${formatCogMean(cog)} is easy to follow mentally. Keep functions short and avoid deep nesting.`;
    }
    return `${formatCogMean(cog)} mean cognitive load is elevated—carve helpers where nesting stacks up.`;
  })();

  const descHal = (() => {
    return `Mean Halstead volume of ${formatHalMean(hal)} means moderate lexical effort per function. The p90 is ${p90h.toFixed(1)}—a few functions are significantly heavier than average.`;
  })();

  return (
    <section
      aria-labelledby="code-complexity-core-signals-heading"
      className="space-y-4"
      id="code-complexity-core-signals"
    >
      <div>
        <h2
          id="code-complexity-core-signals-heading"
          className="text-sm font-medium tracking-wide text-muted-foreground"
        >
          Core Signals
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CoreSignalCard
          title="Maintainability Index"
          tier={tMi}
          value={formatMiMean(mi)}
          description={descMi}
          titleInfo="Composite 0–100-style index from volume, cyclomatic, and size in this engine's GRAD-AI normalization."
          onOpenDeepDive={onOpenDeepDive ? () => onOpenDeepDive("mi") : undefined}
        />
        <CoreSignalCard
          title="Cognitive Complexity"
          tier={tCog}
          value={formatCogMean(cog)}
          description={descCog}
          titleInfo="Nesting-weighted mental load per function—higher means harder to simulate when reading."
          onOpenDeepDive={onOpenDeepDive ? () => onOpenDeepDive("cognitive") : undefined}
        />
        <CoreSignalCard
          title="Halstead Volume"
          tier={tHal}
          value={formatHalMean(hal)}
          description={descHal}
          titleInfo="Lexical size of the implementation (operator/operand usage)—larger functions read as heavier."
          onOpenDeepDive={onOpenDeepDive ? () => onOpenDeepDive("halstead") : undefined}
        />
      </div>
    </section>
  );
}
