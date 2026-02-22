"use client";

import { useCallback } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildFeatureVector,
  getFeaturesByCategoryCount,
} from "@/lib/featureVector";
import { MetadataCard } from "./MetadataCard";
import { ResearchFramingBanner } from "./ResearchFramingBanner";
import { FeatureCountSummary } from "./FeatureCountSummary";
import { FeatureVectorTable } from "./FeatureVectorTable";
import { DistributionMetricsSection } from "./DistributionMetricsSection";
import { RawJsonViewer } from "./RawJsonViewer";
import { DataDictionarySection } from "./DataDictionarySection";
import type { RepoReport } from "@/lib/reportTypes";

interface DatasetTabProps {
  report: RepoReport;
  resultId: string;
}

const SCHEMA_VERSION = 1;

export function DatasetTab({ report, resultId }: DatasetTabProps) {
  const vec = buildFeatureVector(report);
  const byCategory = getFeaturesByCategoryCount(vec);

  const exportFilename =
    resultId.replace(/[/\\]/g, "_") +
    "_" +
    (report.source?.commit?.slice(0, 7) ?? "n/a") +
    "_" +
    (report.analysis_timestamp
      ? new Date(report.analysis_timestamp).toISOString().replace(/[:.]/g, "-").slice(0, 19)
      : "export");

  const handleExportCSV = useCallback(() => {
    const headers = Object.keys(vec).join(",");
    const row = Object.values(vec)
      .map((v) =>
        typeof v === "string" && v.includes(",") ? `"${v}"` : String(v)
      )
      .join(",");
    const csv = `${headers}\n${row}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repo-${exportFilename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [vec, exportFilename]);

  const structuredExport = useCallback(() => {
    const metadata = {
      resultId,
      repositoryUrl: report.source?.type === "git" ? report.source.url : report.repoPath,
      commit: report.source?.commit,
      branch: report.source?.branch,
      analysisTimestamp: report.analysis_timestamp,
      analyzerVersion: report.analyzer_version,
    };
    const perFileSummaries = (report.perFile ?? []).map((p) => ({
      file: p.file,
      functions: p.functions,
      totalComplexity: (p.complexity ?? []).reduce((s, c) => s + c.complexity, 0),
    }));
    const structured = {
      schema_version: SCHEMA_VERSION,
      metadata,
      flat_feature_vector: vec,
      features_by_category: byCategory,
      distributions: report.distributions ?? null,
      per_file_summaries: perFileSummaries,
    };
    const blob = new Blob([JSON.stringify(structured, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repo-${exportFilename}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, vec, byCategory, resultId, exportFilename]);

  return (
    <div className="space-y-8">
      <ResearchFramingBanner />
      <MetadataCard report={report} />
      <FeatureCountSummary report={report} />
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleExportCSV} className="gap-2">
          <Download className="size-4" />
          Export CSV
        </Button>
        <Button variant="outline" onClick={structuredExport} className="gap-2">
          <Download className="size-4" />
          Export Structured JSON
        </Button>
      </div>
      <section>
        <h3 className="text-lg font-semibold mb-4">Feature Vector</h3>
        <FeatureVectorTable report={report} />
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-4">Distribution Metrics</h3>
        <DistributionMetricsSection report={report} />
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-4">Raw JSON</h3>
        <RawJsonViewer data={report} />
      </section>
      <section>
        <DataDictionarySection />
      </section>
    </div>
  );
}
