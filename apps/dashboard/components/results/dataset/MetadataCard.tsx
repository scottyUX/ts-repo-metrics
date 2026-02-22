"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import type { RepoReport } from "@/lib/reportTypes";

interface MetadataCardProps {
  report: RepoReport;
}

export function MetadataCard({ report }: MetadataCardProps) {
  const [copied, setCopied] = useState(false);
  const commitSha = report.source?.commit ?? "—";
  const shortSha = commitSha.slice(0, 7);

  const handleCopy = useCallback(async () => {
    if (commitSha === "—") return;
    await navigator.clipboard.writeText(commitSha);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [commitSha]);

  const url = report.source?.type === "git" ? report.source.url : report.repoPath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repository Metadata</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <span className="text-muted-foreground">Repository URL:</span>{" "}
          <span className="font-mono break-all">{url || "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Commit SHA:</span>
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded">
            {shortSha}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="size-4 text-green-600" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
        <div>
          <span className="text-muted-foreground">Branch:</span>{" "}
          {report.source?.branch ?? "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Analysis timestamp:</span>{" "}
          {report.analysis_timestamp
            ? new Date(report.analysis_timestamp).toLocaleString()
            : "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Analyzer version:</span>{" "}
          {report.analyzer_version ?? "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Files analyzed:</span>{" "}
          {report.filesAnalyzed ?? 0}
        </div>
        <div>
          <span className="text-muted-foreground">Files skipped:</span>{" "}
          {report.filesSkipped ?? 0}
        </div>
      </CardContent>
    </Card>
  );
}
