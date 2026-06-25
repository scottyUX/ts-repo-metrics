"use client";

import type { ReactMetricsReport } from "@/lib/reportTypes";
import { CoreSignalCard, type CoreSignalTier } from "./CoreSignalsPrimitives";

interface ReactComponentsCoreSignalsSectionProps {
  reactMetrics: ReactMetricsReport;
}

function formatInt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

function tierTsxFilesAnalyzed(n: number): CoreSignalTier {
  if (n <= 0) return "critical";
  if (n < 8) return "good";
  return "strong";
}

function tierComponentsAnalyzed(n: number): CoreSignalTier {
  if (n <= 0) return "critical";
  if (n < 12) return "good";
  return "strong";
}

/** Fewer low-cohesion components is better (Ferreira heuristic). */
function tierLowCohesionCount(n: number): CoreSignalTier {
  if (n === 0) return "strong";
  if (n <= 3) return "good";
  if (n <= 8) return "needs_work";
  return "critical";
}

export function ReactComponentsCoreSignalsSection({ reactMetrics }: ReactComponentsCoreSignalsSectionProps) {
  const s = reactMetrics.summary;
  const tsx = s.tsxFilesAnalyzed;
  const comps = s.componentsAnalyzed;
  const lowCohesion = s.ferreiraLackOfCohesionCount;
  const tampere = s.tampereJsxDepthExceededCount;

  const tTsx = tierTsxFilesAnalyzed(tsx);
  const tComps = tierComponentsAnalyzed(comps);
  const tCohesion = tierLowCohesionCount(lowCohesion);

  const descTsx = (() => {
    if (tsx <= 0) {
      return "No .tsx or .jsx files were counted—confirm paths and that the React metrics pass ran.";
    }
    if (tTsx === "strong") {
      return `${formatInt(tsx)} TSX/JSX files parsed: broad UI surface; watch Additional signals for depth and hooks.`;
    }
    return `${formatInt(tsx)} TSX/JSX files in scope—enough for signals; expand includes if UI lives elsewhere.`;
  })();

  const descComps = (() => {
    if (comps <= 0) {
      return "No JSX-bearing components detected—verify TSX files and analyzer scope.";
    }
    return `${formatInt(comps)} components (functions whose body contains JSX)—heuristic count for triage.`;
  })();

  const descCohesion = (() => {
    if (lowCohesion === 0) {
      return "No Ferreira-style lack-of-cohesion flags in this run—large multi-hook components are not dominating.";
    }
    if (tCohesion === "needs_work" || tCohesion === "critical") {
      return `${lowCohesion} components flag cohesion risk; ${tampere} exceed JSX depth >5—split layers before adding logic.`;
    }
    return `${lowCohesion} component${lowCohesion === 1 ? "" : "s"} show cohesion heuristics—triage the oversized table below.`;
  })();

  return (
    <section
      aria-labelledby="react-components-core-signals-heading"
      className="space-y-4"
      id="react-components-core-signals"
    >
      <div>
        <h2
          id="react-components-core-signals-heading"
          className="text-sm font-medium tracking-wide text-muted-foreground"
        >
          Core Signals
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CoreSignalCard
          title="TSX Files Analyzed"
          tier={tTsx}
          value={formatInt(tsx)}
          description={descTsx}
        />
        <CoreSignalCard
          title="Components"
          tier={tComps}
          value={formatInt(comps)}
          description={descComps}
        />
        <CoreSignalCard
          title="Low-Cohesion Components"
          tier={tCohesion}
          value={formatInt(lowCohesion)}
          description={descCohesion}
        />
      </div>
    </section>
  );
}
