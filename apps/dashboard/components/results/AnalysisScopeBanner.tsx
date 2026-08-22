"use client";

import type { RepoReport } from "@/lib/reportTypes";
import { isPrScopedReport } from "@/lib/analysisScope";

export function AnalysisScopeBanner({ report }: { report: RepoReport }) {
  if (!isPrScopedReport(report)) return null;
  const n = report.source.prNumber;
  const files = report.source.changedFiles?.length ?? report.filesAnalyzed;
  const head = report.source.headSha?.slice(0, 7) ?? report.source.commit?.slice(0, 7);
  const base = report.source.baseSha?.slice(0, 7);
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
      <span className="font-medium text-foreground">
        Pull request{n ? ` #${n}` : ""}
      </span>
      <span className="ml-2 text-muted-foreground">
        {files} changed source file{files === 1 ? "" : "s"}
        {head ? ` · head ${head}` : ""}
        {base ? ` vs base ${base}` : ""}
      </span>
    </div>
  );
}
