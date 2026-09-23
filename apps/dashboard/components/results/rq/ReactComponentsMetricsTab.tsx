"use client";

import { useMemo } from "react";
import { ReactComponentsAdditionalSignalsSection } from "./ReactComponentsAdditionalSignalsSection";
import { ReactComponentsCoreSignalsSection } from "./ReactComponentsCoreSignalsSection";
import { ReactComponentsImprovementSection } from "./ReactComponentsImprovementSection";
import { ReactComponentsOversizedTable } from "./ReactComponentsOversizedTable";
import type { RepoReport } from "@/lib/reportTypes";

interface ReactComponentsMetricsTabProps {
  report: RepoReport;
  onOpenCodeQualityTab?: () => void;
}

export function ReactComponentsMetricsTab({ report, onOpenCodeQualityTab }: ReactComponentsMetricsTabProps) {
  const rm = report.reactMetrics;
  const tsxCount =
    (report.profile?.tsxFiles ?? 0) + (report.profile?.jsxFiles ?? 0);

  const topBySloc = useMemo(() => {
    if (!rm?.components.length) return null;
    return [...rm.components].sort((a, b) => b.lines - a.lines)[0] ?? null;
  }, [rm]);

  if (!rm) {
    const hasTsxButNoBlock = tsxCount > 0;
    return (
      <div className="space-y-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {hasTsxButNoBlock ? (
            <>
              This report lists <strong>{tsxCount}</strong>{" "}
              <code className="rounded bg-muted px-1">.jsx</code> /{" "}
              <code className="rounded bg-muted px-1">.tsx</code> file{tsxCount === 1 ? "" : "s"} in the profile, but
              there is no <code className="rounded bg-muted px-1">reactMetrics</code> block. Re-run analysis with the
              current <code className="rounded bg-muted px-1">@repo-metrics/engine</code>, or clear an outdated browser
              cache for this result.
            </>
          ) : (
            <>
              No React metrics: no <code className="rounded bg-muted px-1">.jsx</code> or{" "}
              <code className="rounded bg-muted px-1">.tsx</code> files, and no JSX components, were in scope for
              this run.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ReactComponentsCoreSignalsSection reactMetrics={rm} />
      <ReactComponentsAdditionalSignalsSection reactMetrics={rm} />
      <ReactComponentsOversizedTable components={rm.components} />
      <ReactComponentsImprovementSection
        topComponent={topBySloc}
        onOpenCodeQualityTab={onOpenCodeQualityTab}
      />
    </div>
  );
}
