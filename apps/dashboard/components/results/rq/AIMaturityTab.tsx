"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoachInsightTone } from "@/components/results/coach/CoachInsightTone";
import { AiUsagePlatformLogo } from "@/components/results/rq/AiUsagePlatformLogo";
import { cn } from "@/lib/utils";
import {
  AI_USAGE_ACTIVE_WINDOW_DAYS,
  analyzeAiUsageCsv,
  type AiUsageData,
  type ToolMixItem,
} from "@/lib/aiUsageCsv";
import {
  AGENT_STATS_REPO_URL,
  AI_USAGE_DESKTOP_CSV_PATH,
  AI_USAGE_PROMPT_PLATFORMS,
  buildAiUsagePrompt,
  type AiUsagePromptPlatform,
} from "@/lib/aiUsagePromptTemplates";
import {
  AiUsageSignalLearnMore,
  type AiUsageSignalId,
} from "@/components/results/rq/aiUsageSignalHelpContent";
import { Check, CircleHelp, Copy } from "lucide-react";

const aiTraceInsightSurface = "bg-card shadow-sm ring-1 ring-border/40";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const HEATMAP_GAP = "gap-1 sm:gap-1.5";
const HEATMAP_CELL = "size-5 shrink-0 rounded-[4px] sm:size-6 md:size-7";
const HEATMAP_LABEL_COL =
  "w-8 shrink-0 text-right text-xs text-muted-foreground sm:w-10 sm:text-sm";
const HEATMAP_MONTH_W = "flex w-5 shrink-0 justify-center sm:w-6 md:w-7";

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function tokenMetricSub(data: AiUsageData): string {
  if (data.tokenUnavailableReason === "cursor_no_usage") {
    return "Cursor agent-transcript logs do not include token usage.";
  }
  return "Re-export with --tokens to unlock this metric.";
}

function heatClass(count: number, max: number): string {
  if (max <= 0 || count <= 0) return "bg-muted/60 border border-border/50";
  const ratio = count / max;
  if (ratio < 0.2) return "border border-sky-950/40 bg-sky-950/40";
  if (ratio < 0.4) return "border border-sky-800/50 bg-sky-800/50";
  if (ratio < 0.6) return "border border-sky-600/60 bg-sky-600/70";
  if (ratio < 0.85) return "border border-sky-500/70 bg-sky-500/80";
  return "border border-sky-400 bg-sky-400/90";
}

function getMonthLabels(columnWeekStarts: string[]): (string | null)[] {
  let previousMonth = -1;
  return columnWeekStarts.map((iso) => {
    const month = Number.parseInt(iso.slice(5, 7), 10) - 1;
    if (month !== previousMonth) {
      previousMonth = month;
      return MONTH_SHORT[month] ?? "";
    }
    return null;
  });
}

function buildAiActivityGrid(
  activeDays: AiUsageData["activeDays"],
  windowStart: string | null,
  windowEnd: string | null,
) {
  if (!windowStart || !windowEnd) return null;

  const dayCountMap = new Map<string, number>();
  for (const day of activeDays) {
    dayCountMap.set(day.date, day.promptCount);
  }

  const start = new Date(`${windowStart}T00:00:00Z`);
  const end = new Date(`${windowEnd}T00:00:00Z`);
  const startDow = (start.getUTCDay() + 6) % 7;
  const endDow = (end.getUTCDay() + 6) % 7;

  const startMonday = new Date(start);
  startMonday.setUTCDate(start.getUTCDate() - startDow);

  const endSunday = new Date(end);
  endSunday.setUTCDate(end.getUTCDate() + (6 - endDow));

  const weeks =
    Math.round(
      (endSunday.getTime() - startMonday.getTime()) / (7 * 86_400_000),
    ) + 1;

  const grid: number[][] = Array.from({ length: 7 }, () =>
    new Array(weeks).fill(0) as number[],
  );
  const columnWeekStarts: string[] = [];
  let maxCount = 0;

  for (let weekIndex = 0; weekIndex < weeks; weekIndex++) {
    const weekMonday = new Date(startMonday);
    weekMonday.setUTCDate(startMonday.getUTCDate() + weekIndex * 7);
    columnWeekStarts.push(weekMonday.toISOString().slice(0, 10));
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const day = new Date(weekMonday);
      day.setUTCDate(weekMonday.getUTCDate() + dayIndex);
      const iso = day.toISOString().slice(0, 10);
      const count = dayCountMap.get(iso) ?? 0;
      grid[dayIndex]![weekIndex] = count;
      if (count > maxCount) maxCount = count;
    }
  }

  return { grid, columnWeekStarts, maxCount };
}

function MetricCard({
  label,
  value,
  sub,
  helpId,
  highlight,
  mono = false,
}: {
  label: string;
  value: string;
  sub: string;
  helpId: AiUsageSignalId;
  highlight?: "good" | "warn" | "bad";
  mono?: boolean;
}) {
  const highlightClass =
    highlight === "good"
      ? "text-emerald-500"
      : highlight === "warn"
        ? "text-amber-500"
        : highlight === "bad"
          ? "text-red-500"
          : "text-foreground";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <AiUsageSignalLearnMore signalId={helpId} />
        </div>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums",
            highlightClass,
            mono && "font-mono",
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {sub}
        </p>
      </CardContent>
    </Card>
  );
}

function ToolMeaningDialog({ tool }: { tool: ToolMixItem }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Explain ${tool.name}`}
        >
          <CircleHelp className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tool.name}</DialogTitle>
          <DialogDescription>
            {tool.count.toLocaleString()} calls, {tool.pct}% of all recorded tool activity.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-relaxed">
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground">What this means</h3>
            <p className="text-muted-foreground">{tool.meaning}</p>
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground">Why it matters</h3>
            <p className="text-muted-foreground">
              This tool contributes to the workflow balance shown above. Use it to understand
              whether the trace leans more toward exploration, generation, or verification.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadZone({
  onFileSelected,
  disabled,
}: {
  onFileSelected: (file: File, text: string) => Promise<void>;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      await onFileSelected(file, text);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) {
      event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed p-8 text-center transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/20 opacity-70"
          : "cursor-pointer border-border hover:border-primary/50 hover:bg-muted/30",
        dragging && !disabled && "border-primary bg-primary/5",
      )}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        if (disabled) return;
        const file = event.dataTransfer.files[0];
        if (file) void handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <div className="pointer-events-none">
        <p className="text-sm font-semibold">Upload `ai_usage_trace.csv`</p>
        <p className="mx-auto mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Use the copied platform prompt above to generate the CSV on your Desktop, then upload it
          here. If you run `agent_stats` manually, include `--messages --tokens --csv`
          {" "}
          <code className="rounded bg-muted px-1 py-0.5">{AI_USAGE_DESKTOP_CSV_PATH}</code>
          . The CSV is parsed locally, then saved on this analysis so it reloads with the result.
        </p>
      </div>
    </div>
  );
}

function AgentStatsExportInsight() {
  const [selectedPlatform, setSelectedPlatform] =
    useState<AiUsagePromptPlatform>("claude");
  const [copiedPlatform, setCopiedPlatform] =
    useState<AiUsagePromptPlatform | null>(null);

  async function handleCopyPrompt(platform: AiUsagePromptPlatform) {
    try {
      await navigator.clipboard.writeText(buildAiUsagePrompt(platform));
      setCopiedPlatform(platform);
      window.setTimeout(() => {
        setCopiedPlatform((current) => (current === platform ? null : current));
      }, 2000);
    } catch {
      setCopiedPlatform(null);
    }
  }

  return (
    <CoachInsightTone
      tone="informational"
      title="Generate your CSV with a copyable prompt"
      className={cn(aiTraceInsightSurface, "border-l-0")}
      bodyClassName="space-y-4 text-sm font-normal text-foreground/90 leading-relaxed"
    >
      <p>
        Choose the coding agent the student used, copy the matching prompt, run it inside that same
        project, and then upload the generated
        {" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
          ai_usage_trace.csv
        </code>
        . The copied prompt tells the agent to infer the best `--filter`, update or clone
        `agent_stats`, and save the CSV on the Desktop.
      </p>

      <Tabs
        value={selectedPlatform}
        onValueChange={(value) => setSelectedPlatform(value as AiUsagePromptPlatform)}
        className="space-y-4"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {AI_USAGE_PROMPT_PLATFORMS.map((platform) => (
            <TabsTrigger
              key={platform.id}
              value={platform.id}
              className="h-auto gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:shadow-none"
            >
              <AiUsagePlatformLogo platform={platform.id} />
              <span>{platform.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {AI_USAGE_PROMPT_PLATFORMS.map((platform) => {
          const prompt = buildAiUsagePrompt(platform.id);
          const copied = copiedPlatform === platform.id;

          return (
            <TabsContent key={platform.id} value={platform.id} className="mt-0">
              <div className="space-y-3 rounded-xl border border-border/60 bg-background/60 p-4">
                <p className="text-sm text-muted-foreground">
                  Run this prompt inside the same
                  {" "}
                  <span className="font-medium text-foreground">{platform.label}</span>
                  {" "}
                  project so the agent can infer the right `--filter`, limit collection to that
                  platform's log files, and write the CSV to your Desktop.
                </p>

                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/70 p-4 text-xs leading-6 text-foreground">
                  {prompt}
                </pre>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleCopyPrompt(platform.id)}
                  >
                    {copied ? (
                      <Check className="mr-2 size-4" />
                    ) : (
                      <Copy className="mr-2 size-4" />
                    )}
                    {copied
                      ? `${platform.shortLabel} prompt copied`
                      : `Copy ${platform.shortLabel} prompt`}
                  </Button>

                  <Button asChild variant="secondary" size="sm">
                    <a href={AGENT_STATS_REPO_URL} target="_blank" rel="noopener noreferrer">
                      Open agent_stats on GitHub
                    </a>
                  </Button>
                </div>

                {platform.tools && (
                  <div className="space-y-2 border-t border-border/40 pt-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Common tool names in your Cursor CSV:
                    </p>
                    {(["exploration", "generation", "verification"] as const).map((bucket) => {
                      const bucketTools = platform.tools!.filter((t) => t.bucket === bucket);
                      if (bucketTools.length === 0) return null;
                      const label =
                        bucket === "exploration"
                          ? "Exploration"
                          : bucket === "generation"
                          ? "Generation"
                          : "Verification";
                      return (
                        <div key={bucket} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-20 shrink-0 text-xs text-muted-foreground">
                            {label}
                          </span>
                          {bucketTools.map((tool) => (
                            <code
                              key={tool.name}
                              className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
                            >
                              {tool.name}
                            </code>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </CoachInsightTone>
  );
}

function DataWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <CoachInsightTone
      tone="informational"
      title="Missing optional data"
      className={aiTraceInsightSurface}
      bodyClassName="text-sm font-normal text-foreground/90"
    >
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </CoachInsightTone>
  );
}

export function AIMaturityTab({ resultId }: { resultId: string }) {
  const [data, setData] = useState<AiUsageData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [statusTone, setStatusTone] = useState<
    "informational" | "positive" | "concern"
  >("informational");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingSavedCsv, setIsLoadingSavedCsv] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPersistedCsv() {
      setIsLoadingSavedCsv(true);
      try {
        const response = await fetch(
          `/api/results/${encodeURIComponent(resultId)}/ai-usage`,
          { cache: "no-store" },
        );
        if (response.status === 404) {
          if (!cancelled) {
            setStatusMessage(null);
          }
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "Failed to load saved AI usage CSV.");
        }
        const body = (await response.json()) as { csvText?: unknown };
        if (typeof body.csvText !== "string") {
          throw new Error("Saved AI usage payload is missing csvText.");
        }
        const parsed = analyzeAiUsageCsv(body.csvText);
        if (!parsed.ok) {
          throw new Error(`Saved AI usage CSV could not be parsed: ${parsed.error}`);
        }
        if (!cancelled) {
          setData(parsed.data);
          setWarnings(parsed.warnings);
          setError(null);
          setStatusTone("positive");
          setStatusMessage("Saved AI Usage CSV loaded for this analysis.");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load AI Usage CSV.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSavedCsv(false);
        }
      }
    }

    void loadPersistedCsv();
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  const activityGrid = useMemo(
    () =>
      data
        ? buildAiActivityGrid(
            data.activeDays,
            data.activeDaysWindowStart,
            data.activeDaysWindowEnd,
          )
        : null,
    [data],
  );
  const monthLabels = activityGrid
    ? getMonthLabels(activityGrid.columnWeekStarts)
    : [];
  const activityLegendMax = Math.max(activityGrid?.maxCount ?? 0, 1);
  const toolMixGroups = useMemo(
    () =>
      data
        ? data.behavioralMix.map((bucket) => ({
            key: bucket.key,
            label: bucket.label,
            summary: bucket.summary,
            pct: bucket.pct,
            count: bucket.count,
            tools: data.toolMix.filter((tool) => tool.bucket === bucket.key),
          }))
        : [],
    [data],
  );

  async function persistCsv(csvText: string) {
    const response = await fetch("/api/ai-usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId, csvText }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(body?.error ?? "Failed to save AI usage CSV.");
    }
  }

  async function handleFileSelected(file: File, text: string) {
    const parsed = analyzeAiUsageCsv(text);
    if (!parsed.ok) {
      setError(parsed.error);
      setStatusTone("concern");
      setStatusMessage(null);
      return;
    }

    setData(parsed.data);
    setWarnings(parsed.warnings);
    setError(null);
    setIsSaving(true);
    setStatusTone("informational");
    setStatusMessage(`Saving ${file.name} on this analysis...`);

    try {
      await persistCsv(text);
      setStatusTone("positive");
      setStatusMessage(`${file.name} saved for this analysis.`);
    } catch (saveError) {
      setStatusTone("concern");
      setStatusMessage(
        saveError instanceof Error
          ? `${saveError.message} The metrics are still loaded locally in this browser session.`
          : "Failed to save AI usage CSV. The metrics are still loaded locally in this browser session.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <AgentStatsExportInsight />
      <UploadZone onFileSelected={handleFileSelected} disabled={isSaving} />

      {isLoadingSavedCsv ? (
        <CoachInsightTone
          tone="informational"
          title="Checking for saved AI Usage data"
          className={aiTraceInsightSurface}
          bodyClassName="text-sm font-normal text-foreground/90"
        >
          <p>Looking for a previously uploaded CSV attached to this analysis.</p>
        </CoachInsightTone>
      ) : null}

      {statusMessage ? (
        <CoachInsightTone
          tone={statusTone}
          title="AI Usage status"
          className={aiTraceInsightSurface}
          bodyClassName="text-sm font-normal text-foreground/90"
        >
          <p>{statusMessage}</p>
        </CoachInsightTone>
      ) : null}

      {error ? (
        <CoachInsightTone
          tone="concern"
          title="AI Usage unavailable"
          className={aiTraceInsightSurface}
          bodyClassName="text-sm font-normal text-foreground/90"
        >
          <p>{error}</p>
        </CoachInsightTone>
      ) : null}

      <DataWarnings warnings={warnings} />

      {!data ? (
        <CoachInsightTone
          tone="informational"
          title="Upload a CSV to see AI Usage metrics"
          className={aiTraceInsightSurface}
          bodyClassName="text-sm font-normal text-foreground/90"
        >
          <p>
            This tab no longer shows demo data. Copy a platform prompt above, run it in the same
            agent project, and upload the resulting `ai_usage_trace.csv` to populate token
            efficiency, prompt quality, workflow patterns, and activity metrics for this analysis.
          </p>
        </CoachInsightTone>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Token efficiency</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Input tokens"
                value={
                  data.hasTokenData ? data.totalInputTokens.toLocaleString() : "—"
                }
                sub={
                  data.hasTokenData
                    ? "Prompt and context tokens sent to the model."
                    : tokenMetricSub(data)
                }
                helpId="input-tokens"
                mono
              />
              <MetricCard
                label="Output tokens"
                value={
                  data.hasTokenData
                    ? data.totalOutputTokens.toLocaleString()
                    : "—"
                }
                sub={
                  data.hasTokenData
                    ? "Response tokens generated by the model."
                    : tokenMetricSub(data)
                }
                helpId="output-tokens"
                mono
              />
              <MetricCard
                label="Cache hit rate"
                value={data.hasTokenData ? formatPct(data.cacheHitRate) : "—"}
                sub={
                  data.hasTokenData
                    ? "Higher is usually faster and cheaper."
                    : tokenMetricSub(data)
                }
                helpId="cache-hit-rate"
                highlight={
                  data.cacheHitRate == null
                    ? undefined
                    : data.cacheHitRate >= 0.4
                      ? "good"
                      : data.cacheHitRate >= 0.2
                        ? "warn"
                        : "bad"
                }
              />
              <MetricCard
                label="Tokens / prompt"
                value={
                  data.hasTokenData && data.totalPrompts > 0
                    ? (data.totalTokens / data.totalPrompts).toFixed(0)
                    : "—"
                }
                sub={
                  data.hasTokenData
                    ? "Average total tokens consumed per prompt."
                    : tokenMetricSub(data)
                }
                helpId="tokens-per-prompt"
                mono
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Prompt quality</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Avg prompt length"
                value={
                  data.avgPromptLength != null
                    ? `${data.avgPromptLength} chars`
                    : "—"
                }
                sub={
                  data.hasMessageData
                    ? "Longer prompts tend to carry more context and constraints."
                    : "Re-export with --messages to unlock this metric."
                }
                helpId="avg-prompt-length"
                highlight={
                  data.avgPromptLength == null
                    ? undefined
                    : data.avgPromptLength < 50
                      ? "warn"
                      : data.avgPromptLength >= 200
                        ? "good"
                        : undefined
                }
              />
              <MetricCard
                label="Detailed prompt rate"
                value={data.hasMessageData ? formatPct(data.detailedPromptRate) : "—"}
                sub={
                  data.hasMessageData
                    ? "Share of prompts with at least 200 characters."
                    : "Re-export with --messages to unlock this metric."
                }
                helpId="detailed-prompt-rate"
                highlight={
                  data.detailedPromptRate != null && data.detailedPromptRate >= 0.35
                    ? "good"
                    : undefined
                }
              />
              <MetricCard
                label="Short prompt rate"
                value={data.hasMessageData ? formatPct(data.shortPromptRate) : "—"}
                sub={
                  data.hasMessageData
                    ? "Share of prompts shorter than 50 characters."
                    : "Re-export with --messages to unlock this metric."
                }
                helpId="short-prompt-rate"
                highlight={
                  data.shortPromptRate != null && data.shortPromptRate >= 0.35
                    ? "warn"
                    : undefined
                }
              />
              <MetricCard
                label="Prompt capture rate"
                value={
                  data.messageCaptureRate != null
                    ? formatPct(data.messageCaptureRate)
                    : "—"
                }
                sub={
                  data.hasMessageData
                    ? `${data.promptsWithText.toLocaleString()} prompts included message text in the export.`
                    : "Re-export with --messages to unlock this metric."
                }
                helpId="message-capture-rate"
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Activity snapshot</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total prompts"
                value={data.totalPrompts.toLocaleString()}
                sub="All prompts captured in the uploaded CSV."
                helpId="total-prompts"
                mono
              />
              <MetricCard
                label="Total tool calls"
                value={data.totalToolCalls.toLocaleString()}
                sub="All tool-call events captured in the uploaded CSV."
                helpId="total-tool-calls"
                mono
              />
              <MetricCard
                label={`Active days (${AI_USAGE_ACTIVE_WINDOW_DAYS}d)`}
                value={data.uniqueDays.toLocaleString()}
                sub="Days with at least one prompt in the visible activity window."
                helpId="active-days"
                mono
              />
              <MetricCard
                label="Prompts per active day"
                value={data.avgPromptsPerDay.toFixed(1)}
                sub="Average prompt intensity on days when AI was used."
                helpId="prompts-per-day"
                mono
              />
            </div>

            {activityGrid ? (
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm ring-1 ring-border/40 sm:p-8">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">AI active days</h3>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Fixed {AI_USAGE_ACTIVE_WINDOW_DAYS}-day view ending on{" "}
                    {data.activeDaysWindowEnd ?? "—"}. Darker cells mean more
                    prompts on that day.
                  </p>
                </div>
                <div className="mt-6 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
                  <div
                    className={cn("inline-flex min-w-0 flex-col", HEATMAP_GAP)}
                    role="img"
                    aria-label="AI activity heatmap for the last 40 days"
                  >
                    <div className={cn("flex", HEATMAP_GAP)}>
                      <div className={cn(HEATMAP_LABEL_COL, "shrink-0")} />
                      {activityGrid.columnWeekStarts.map((_, weekIndex) => (
                        <div
                          key={`month-${weekIndex}`}
                          className={HEATMAP_MONTH_W}
                        >
                          <span className="text-xs font-medium leading-none text-muted-foreground sm:text-sm">
                            {monthLabels[weekIndex] ?? ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    {WEEKDAY_LETTERS.map((letter, dayIndex) => (
                      <div
                        key={dayIndex}
                        className={cn("flex items-center", HEATMAP_GAP)}
                      >
                        <div className={cn(HEATMAP_LABEL_COL, "select-none")}>
                          {letter}
                        </div>
                        {activityGrid.grid[dayIndex]!.map((count, weekIndex) => (
                          <div
                            key={`${dayIndex}-${weekIndex}`}
                            title={`${WEEKDAY_NAMES[dayIndex]} ${activityGrid.columnWeekStarts[weekIndex] ?? ""}: ${count} prompt(s)`}
                            className={cn(
                              HEATMAP_CELL,
                              heatClass(count, activityGrid.maxCount),
                            )}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                  <span>Less</span>
                  <div className={cn("flex", HEATMAP_GAP)}>
                    {[0.1, 0.35, 0.55, 0.8, 1].map((tier, index) => (
                      <div
                        key={index}
                        className={cn(
                          "size-5 rounded-[3px] sm:size-6",
                          heatClass(Math.ceil(tier * activityLegendMax), activityLegendMax),
                        )}
                      />
                    ))}
                  </div>
                  <span>More</span>
                </div>

                <p className="mt-4 text-sm text-muted-foreground tabular-nums">
                  {data.uniqueDays} active days · {data.avgPromptsPerDay.toFixed(1)} prompts/day
                  {data.busiestDay ? ` · Busiest: ${data.busiestDay}` : ""}
                </p>
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Workflow pattern</h2>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-border/40 sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">
                    Behavioral tool mix
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Tool calls are grouped into exploration, generation, and
                    verification / execution so students can see whether the
                    workflow is balanced.
                  </p>
                </div>
                <AiUsageSignalLearnMore signalId="workflow-diagnostic" />
              </div>
              <div className="flex h-5 overflow-hidden rounded-full bg-muted">
                {data.behavioralMix.map((item) => (
                  <div
                    key={item.key}
                    className={item.colorClass}
                    style={{ width: `${item.pct}%` }}
                    title={`${item.label}: ${item.pct}%`}
                  />
                ))}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Exploration"
                  value={`${data.behavioralMix[0]?.pct ?? 0}%`}
                  sub={data.behavioralMix[0]?.summary ?? ""}
                  helpId="exploration-share"
                  highlight={
                    (data.behavioralMix[0]?.pct ?? 0) < 15 ? "warn" : undefined
                  }
                />
                <MetricCard
                  label="Generation"
                  value={`${data.behavioralMix[1]?.pct ?? 0}%`}
                  sub={data.behavioralMix[1]?.summary ?? ""}
                  helpId="generation-share"
                  highlight={
                    (data.behavioralMix[1]?.pct ?? 0) > 65 ? "warn" : undefined
                  }
                />
                <MetricCard
                  label="Verification / execution"
                  value={`${data.behavioralMix[2]?.pct ?? 0}%`}
                  sub={data.behavioralMix[2]?.summary ?? ""}
                  helpId="verification-share"
                  highlight={
                    (data.behavioralMix[2]?.pct ?? 0) < 10 ? "warn" : undefined
                  }
                />
              </div>
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium">
                      {data.behavioralDiagnostic.title}
                    </CardTitle>
                    <AiUsageSignalLearnMore signalId="workflow-diagnostic" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {data.behavioralDiagnostic.body}
                  </p>
                </CardContent>
              </Card>
              <details className="mt-4 rounded-lg border px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Raw tool breakdown
                </summary>
                <div className="mt-3 space-y-5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Tools are grouped into the same workflow categories used above so students can
                    see which individual actions count as exploration, generation, or verification
                    / execution.
                  </p>
                  {toolMixGroups.map((group) => (
                    <div key={group.key} className="space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">
                            {group.label}
                          </h4>
                          <p className="text-xs text-muted-foreground">{group.summary}</p>
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {group.pct}% · {group.count.toLocaleString()} calls
                        </div>
                      </div>

                      <div className="space-y-2">
                        {group.tools.map((tool) => (
                          <div
                            key={`${group.key}-${tool.name}`}
                            className="grid min-w-0 grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem_auto] items-center gap-3 text-sm lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_3rem_auto]"
                          >
                            <span
                              className="truncate font-medium"
                              title={tool.name}
                            >
                              {tool.name}
                            </span>
                            <div className="h-1.5 min-w-0 rounded-full bg-muted">
                              <div
                                className="h-1.5 rounded-full bg-foreground/70"
                                style={{ width: `${tool.pct}%` }}
                              />
                            </div>
                            <span className="w-12 text-right tabular-nums text-muted-foreground">
                              {tool.pct}%
                            </span>
                            <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                              <span className="tabular-nums">{tool.count.toLocaleString()} calls</span>
                              <ToolMeaningDialog tool={tool} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Session behavior</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Sessions"
                value={data.totalSessions.toLocaleString()}
                sub="Distinct session IDs in the CSV."
                helpId="sessions"
                mono
              />
              <MetricCard
                label="Avg prompts / session"
                value={data.avgPromptsPerSession.toFixed(1)}
                sub="Average prompts inside each session."
                helpId="avg-prompts-per-session"
                mono
              />
              <MetricCard
                label="Avg tool calls / session"
                value={data.avgSessionLengthTools.toFixed(1)}
                sub="Average tool depth inside each session."
                helpId="avg-tools-per-session"
                mono
              />
              <MetricCard
                label="Tool calls / prompt"
                value={data.toolCallsPerPrompt.toFixed(1)}
                sub="Average tool steps triggered by each prompt."
                helpId="tool-calls-per-prompt"
                mono
                highlight={
                  data.toolCallsPerPrompt > 6
                    ? "warn"
                    : data.toolCallsPerPrompt <= 3
                      ? "good"
                      : undefined
                }
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Review habits</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard
                label="Write ratio"
                value={formatPct(data.writeRatio)}
                sub="Share of tool calls that directly changed code or content."
                helpId="write-ratio"
                highlight={data.writeRatio > 0.5 ? "warn" : undefined}
              />
              <MetricCard
                label="Read-after-write rate"
                value={formatPct(data.globalVerificationRatio)}
                sub="How often the next tool call after a write is a read."
                helpId="read-after-write-rate"
                highlight={data.globalVerificationRatio >= 0.6 ? "good" : undefined}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
