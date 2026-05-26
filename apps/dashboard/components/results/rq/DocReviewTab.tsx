"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ClassifiedDoc,
  DocReviewResult,
  DocumentReview,
} from "@/lib/docReview/types";
import type { RepoReport } from "@/lib/reportTypes";

interface DocReviewTabProps {
  resultId: string;
  report: RepoReport;
}

function formatDocType(docType: string): string {
  return docType.replace(/_/g, " ");
}

function formatChecklistKey(key: string): string {
  return key.replace(/_/g, " ");
}

function ChecklistBreakdown({ review }: { review: DocumentReview }) {
  if (!review.structured?.checklist) return null;
  const entries = Object.entries(review.structured.checklist);
  const passed = entries.filter(([, v]) => v).length;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Checklist: {passed}/{entries.length} criteria met
      </p>
      <ul className="space-y-1">
        {entries.map(([key, value]) => (
          <li key={key} className="flex items-start gap-2 text-sm">
            {value ? (
              <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
            ) : (
              <X className="mt-0.5 size-4 shrink-0 text-red-500 dark:text-red-400" aria-hidden />
            )}
            <span className={value ? "text-foreground" : "text-muted-foreground"}>
              {formatChecklistKey(key)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}


function ClassificationRow({ doc }: { doc: ClassifiedDoc }) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2 pr-3 font-mono text-xs align-top">{doc.path}</td>
      <td className="py-2 pr-3 align-top capitalize">{formatDocType(doc.docType)}</td>
      <td className="py-2 pr-3 align-top text-muted-foreground">
        {doc.sprintNumber ?? "—"}
      </td>
      <td className="py-2 align-top">
        {doc.duplicate ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">duplicate</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function ReviewCard({
  doc,
  review,
}: {
  doc: ClassifiedDoc;
  review?: DocumentReview;
}) {
  const isUnknown = doc.docType === "unknown";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium capitalize">
          {formatDocType(doc.docType)}
          {doc.sprintNumber ? ` · Sprint ${doc.sprintNumber}` : ""}
          {doc.duplicate ? (
            <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
              duplicate
            </span>
          ) : null}
        </CardTitle>
        <CardDescription className="font-mono text-xs">{doc.path}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isUnknown ? (
          <p className="text-muted-foreground">
            This file was not matched to a course document type, so no rubric review was run.
            Rename or move it under a docs folder with a clearer name (e.g.{" "}
            <span className="font-mono text-xs">sprint1-report.md</span>,{" "}
            <span className="font-mono text-xs">release-plan.md</span>).
          </p>
        ) : null}

        {review?.error ? (
          <p className="text-destructive">Review error: {review.error}</p>
        ) : null}

        {!isUnknown && !review ? (
          <p className="text-muted-foreground">No review result stored for this file.</p>
        ) : null}

        {review?.structured?.userStoryCount != null ? (
          <p className="text-sm">
            <span className="font-medium">User stories: </span>
            {review.structured.userStoryCount}
          </p>
        ) : null}

        {review && !review.error ? <ChecklistBreakdown review={review} /> : null}

        {review?.structured?.coach ? (
          <div>
            <p className="mb-1 font-medium">Coach feedback</p>
            <p className="leading-relaxed text-muted-foreground">{review.structured.coach}</p>
          </div>
        ) : null}

        {review?.holistic ? (
          <div className="space-y-2 text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Strengths: </span>
              {review.holistic.strengths}
            </p>
            <p>
              <span className="font-medium text-foreground">Suggestions: </span>
              {review.holistic.improvements}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DocReviewTab({ resultId, report }: DocReviewTabProps) {
  const [docReview, setDocReview] = useState<DocReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courseId = report._submission?.course_id?.trim();

  const fetchExisting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/results/${encodeURIComponent(resultId)}/doc-review`, {
        credentials: "include",
      });
      if (res.status === 404) {
        setDocReview(null);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to load (${res.status})`);
      }
      setDocReview((await res.json()) as DocReviewResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load doc review");
    } finally {
      setLoading(false);
    }
  }, [resultId]);

  useEffect(() => {
    void fetchExisting();
  }, [fetchExisting]);

  const runReview = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/doc-review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultId,
          url: report.source?.url,
          report,
        }),
      });
      const data = (await res.json()) as DocReviewResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Review failed (${res.status})`);
      }
      setDocReview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Documentation review failed");
    } finally {
      setRunning(false);
    }
  };

  const stats = useMemo(() => {
    if (!docReview) return null;
    const discovered =
      docReview.discovery.docsPool.length + docReview.discovery.repoWide.length;
    const skippedImages = docReview.discovery.skippedImages?.length ?? 0;
    const classified = docReview.classifications.length;
    const reviewed = Object.keys(docReview.reviews).length;
    const knownTypes = docReview.classifications.filter(
      (c) => c.docType !== "unknown",
    ).length;
    return { discovered, skippedImages, classified, reviewed, knownTypes };
  }, [docReview]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading documentation review…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {courseId ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
          <span className="font-medium text-blue-900 dark:text-blue-100">
            Research submission
          </span>
          <span className="ml-4 text-blue-700 dark:text-blue-300">
            Documentation review supports course research and is not used to grade individual
            students.
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!docReview ? (
        <Card>
          <CardHeader>
            <CardTitle>Review project documentation</CardTitle>
            <CardDescription>
              Classify and review planning documents (.md / .pdf) in this repository against
              course rubrics. PNG and JPG files in docs folders are listed but not reviewed.
              Typical run ~1 minute; requires sign-in and OpenAI configuration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void runReview()} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Reviewing…
                </>
              ) : (
                "Review documentation"
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {docReview && stats ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {docReview.folder_found
                  ? "Documentation folder found"
                  : "No dedicated docs folder — searched repo-wide"}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.discovered} .md/.pdf discovered
                {stats.skippedImages > 0
                  ? ` · ${stats.skippedImages} image(s) skipped`
                  : ""}
                {" · "}
                {stats.classified} classified ({stats.knownTypes} known type
                {stats.knownTypes === 1 ? "" : "s"})
                {" · "}
                {stats.reviewed} reviewed
                {docReview.timings
                  ? ` · ${(docReview.timings.totalMs / 1000).toFixed(1)}s`
                  : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void runReview()} disabled={running}>
              {running ? "Re-running…" : "Re-run review"}
            </Button>
          </div>

          {docReview.warnings.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {docReview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {docReview.classifications.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Document reviews</h3>
              {docReview.classifications.map((c) => (
                <ReviewCard key={c.path} doc={c} review={docReview.reviews[c.path]} />
              ))}
            </div>
          ) : stats.skippedImages > 0 && stats.discovered === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Minus className="size-4 text-muted-foreground" aria-hidden />
                  Documentation present as images only
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                This repo has files under documentation folders, but they are images rather than
                markdown or PDF. Consistency checks may flag missing release plans or code
                standards until those are available in a reviewable format.
              </CardContent>
            </Card>
          ) : null}

          {docReview.classifications.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Classifications</CardTitle>
                <CardDescription>
                  Every discovered .md/.pdf file and how the classifier labeled it.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Path</th>
                      <th className="pb-2 pr-3 font-medium">Type</th>
                      <th className="pb-2 pr-3 font-medium">Sprint</th>
                      <th className="pb-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docReview.classifications.map((c) => (
                      <ClassificationRow key={c.path} doc={c} />
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No reviewable documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  No .md or .pdf files were found to classify. If planning docs exist as PNG or
                  JPG screenshots, they appear under skipped images or pipeline notes above.
                </p>
                {(docReview.discovery.skippedImages?.length ?? 0) > 0 ? (
                  <p>
                    For repos with{" "}
                    <span className="font-mono text-xs">Release.png</span> and{" "}
                    <span className="font-mono text-xs">CodeStandards.png</span>, re-export those
                    as markdown or PDF to get rubric reviews.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          {docReview.consistency.warnings.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Consistency checks</CardTitle>
                <CardDescription>
                  Deterministic checks across classified documents and repo metadata.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {docReview.consistency.warnings.map((w) => (
                    <li key={`${w.code}-${w.message}`} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{w.code}:</span> {w.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {(docReview.discovery.skippedImages?.length ?? 0) > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Skipped image files</CardTitle>
                <CardDescription>
                  Only markdown and PDF are reviewed. Export release plans and code standards as
                  .md or .pdf if you want rubric feedback.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                  {docReview.discovery.skippedImages!.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
