"use client";

import { MetricCard } from "../MetricCard";
import type { ReactMetricsReport } from "@/lib/reportTypes";
import {
  ReactComponentsAsyncUseEffectBody,
  ReactComponentsConditionalHooksBody,
  ReactComponentsMaxJsxDepthRepoBody,
  ReactComponentsMissingDepsBody,
  ReactComponentsNonPrimitiveDepsBody,
  ReactComponentsPropDrillingBody,
  ReactComponentsTampereBody,
} from "./metricHelpContent";

interface ReactComponentsAdditionalSignalsSectionProps {
  reactMetrics: ReactMetricsReport;
  prScoped?: boolean;
}

export function ReactComponentsAdditionalSignalsSection({
  reactMetrics,
  prScoped,
}: ReactComponentsAdditionalSignalsSectionProps) {
  const s = reactMetrics.summary;

  return (
    <section aria-labelledby="react-components-additional-signals-heading" className="space-y-4">
      <h2 id="react-components-additional-signals-heading" className="text-lg font-semibold">
        Additional signals
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="JSX Depth > 5"
          value={s.tampereJsxDepthExceededCount}
          metricCategory="code-quality"
          hideResearchBadge
          description="Components deeper than the Tampere depth threshold."
          tooltip="Components deeper than the Tampere depth threshold."
          metricHelp={{
            title: "Tampere-style JSX depth",
            children: <ReactComponentsTampereBody />,
          }}
        />
        <MetricCard
          label="Max JSX Depth"
          value={s.maxJsxDepthRepo}
          metricCategory="code-quality"
          hideResearchBadge
          description="Worst nested JSX depth in any component in this run."
          tooltip="Worst nested JSX depth in any component."
          metricHelp={{
            title: prScoped ? "Maximum JSX depth (this pull request)" : "Maximum JSX depth (repository)",
            children: <ReactComponentsMaxJsxDepthRepoBody />,
          }}
        />
        <MetricCard
          label="Prop Pass-Through Edges"
          value={s.totalPropDrillingEdges}
          metricCategory="code-quality"
          hideResearchBadge
          description="Same-file prop drilling edges (MVP detector)."
          tooltip="Same-file prop drilling edges (MVP detector)."
          metricHelp={{
            title: "Prop pass-through edges",
            children: <ReactComponentsPropDrillingBody />,
          }}
        />
        <MetricCard
          label="Conditional Hook Calls"
          value={s.totalConditionalHookCalls}
          metricCategory="code-quality"
          hideResearchBadge
          description="use* under control flow (Rules of Hooks)."
          tooltip="use* under control flow (Rules of Hooks)."
          metricHelp={{
            title: "Conditional hook calls",
            children: <ReactComponentsConditionalHooksBody />,
          }}
        />
        <MetricCard
          label="Async useEffect"
          value={s.totalAsyncUseEffect}
          metricCategory="code-quality"
          hideResearchBadge
          description="async function passed to useEffect."
          tooltip="async function passed to useEffect."
          metricHelp={{
            title: "Async useEffect",
            children: <ReactComponentsAsyncUseEffectBody />,
          }}
        />
        <MetricCard
          label="Missing/Invalid Deps"
          value={s.totalMissingOrInvalidDepsArray}
          metricCategory="code-quality"
          hideResearchBadge
          description="Dependency arrays the analyzer could not verify statically."
          tooltip="Dependency arrays we cannot verify statically."
          metricHelp={{
            title: "Missing or invalid dependency arrays",
            children: <ReactComponentsMissingDepsBody />,
          }}
        />
        <MetricCard
          label="Non-Primitive Dep Risk"
          value={s.totalNonPrimitiveDepRisk}
          metricCategory="code-quality"
          hideResearchBadge
          description="Deps likely to change identity each render."
          tooltip="Deps likely to change identity each render."
          metricHelp={{
            title: "Non-primitive dependency risk",
            children: <ReactComponentsNonPrimitiveDepsBody />,
          }}
        />
      </div>
    </section>
  );
}
