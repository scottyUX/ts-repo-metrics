"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RQ1Tab } from "./rq/RQ1Tab";
import { RQ2Tab } from "./rq/RQ2Tab";
import { RQ3Tab } from "./rq/RQ3Tab";
import { DatasetTab } from "./dataset/DatasetTab";
import { CrossRQInsightPanel } from "./CrossRQInsightPanel";
import type { RepoReport } from "@/lib/reportTypes";

interface ResultsDashboardProps {
  report: RepoReport;
  resultId: string;
}

export function ResultsDashboard({ report, resultId }: ResultsDashboardProps) {
  const commit = report?.source?.commit?.slice(0, 7) ?? "—";
  const exportFilename = `repo-metrics-${resultId}-${commit}.json`;

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, exportFilename]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analysis Results</h1>
          <p className="text-muted-foreground text-sm">Commit: {commit}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" className="gap-2">
            <Download className="size-4" />
            Export JSON
          </Button>
          <Button asChild variant="outline">
            <Link href="/" className="gap-2">
              <ArrowLeft className="size-4" />
              New Analysis
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="rq1">
        <TabsList>
          <TabsTrigger value="rq1">RQ1 — Behavioral Shift</TabsTrigger>
          <TabsTrigger value="rq2">RQ2 — Verification & Engagement</TabsTrigger>
          <TabsTrigger value="rq3">RQ3 — Quality Outcomes</TabsTrigger>
          <TabsTrigger value="dataset">Dataset</TabsTrigger>
        </TabsList>
        <TabsContent value="rq1">
          <div className="space-y-8">
            <RQ1Tab report={report} />
            <CrossRQInsightPanel report={report} />
          </div>
        </TabsContent>
        <TabsContent value="rq2">
          <div className="space-y-8">
            <RQ2Tab report={report} />
            <CrossRQInsightPanel report={report} />
          </div>
        </TabsContent>
        <TabsContent value="rq3">
          <div className="space-y-8">
            <RQ3Tab report={report} />
            <CrossRQInsightPanel report={report} />
          </div>
        </TabsContent>
        <TabsContent value="dataset">
          <DatasetTab report={report} resultId={resultId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
