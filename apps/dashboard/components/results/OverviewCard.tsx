"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ResultsTabId } from "@/lib/resultsNavigation";

/** Width / height of overview tiles in design reference (~258×324). */
export const OVERVIEW_CARD_ASPECT_CLASS = "aspect-[258/324]";

export interface OverviewCardItem {
  id: string;
  title: string;
  tier: "strong" | "good" | "needs_work" | "critical";
  score: number | null;
  description: string;
  detailsLabel?: string;
  detailsHref?: string;
  /** When set, activate this results tab before following `detailsHref` (hash scroll). */
  detailsTab?: ResultsTabId;
}

const tierPositive = {
  badgeClassName:
    "border-transparent bg-green-100 font-medium text-green-800 dark:bg-green-950/50 dark:text-green-400",
  scoreClassName: "text-green-700 dark:text-green-400",
};

const tierMeta: Record<
  OverviewCardItem["tier"],
  { label: string; badgeClassName: string; scoreClassName: string }
> = {
  strong: { label: "Strong", ...tierPositive },
  good: { label: "Good", ...tierPositive },
  needs_work: {
    label: "Needs Work",
    badgeClassName:
      "border-transparent bg-amber-100 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-400",
    scoreClassName: "text-amber-700 dark:text-amber-400",
  },
  critical: {
    label: "Critical",
    badgeClassName:
      "border-transparent bg-red-100 font-medium text-red-800 dark:bg-red-950/50 dark:text-red-400",
    scoreClassName: "text-red-700 dark:text-red-400",
  },
};

interface OverviewCardProps {
  item: OverviewCardItem;
  selected?: boolean;
  className?: string;
  onRequestTab?: (tab: ResultsTabId) => void;
}

export function OverviewCard({ item, selected = false, className, onRequestTab }: OverviewCardProps) {
  const tier = tierMeta[item.tier];
  const detailsLabel = item.detailsLabel ?? "View details →";

  return (
    <div className={cn("relative w-full pt-3", className)}>
      {selected ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 -translate-y-1/2"
          aria-hidden
        >
          <span className="rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300">
            Start here
          </span>
        </div>
      ) : null}

      <Card
        className={cn(
          OVERVIEW_CARD_ASPECT_CLASS,
          "group/card flex min-h-0 w-full flex-col gap-0 overflow-visible rounded-md border py-0 shadow-none",
          selected
            ? "border-red-400 dark:border-red-700"
            : "border-border hover:border-border hover:bg-muted/30",
        )}
      >
        <CardHeader className="gap-2 space-y-0 px-5 pb-3 pt-5">
          <CardTitle className="text-sm font-semibold leading-snug tracking-tight text-card-foreground">
            {item.title}
          </CardTitle>
          <Badge variant="outline" className={cn("w-fit border-0 font-medium", tier.badgeClassName)}>
            {tier.label}
          </Badge>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-5 pb-3 pt-0">
          {item.score !== null ? (
            <p
              className={cn(
                "text-[2rem] font-bold leading-none tabular-nums tracking-tight transition-colors duration-200 sm:text-4xl",
                tier.scoreClassName,
              )}
            >
              {item.score}
            </p>
          ) : (
            <p className="text-[2rem] font-bold tabular-nums leading-none text-muted-foreground sm:text-4xl">
              —
            </p>
          )}
          <p className="text-sm leading-snug text-muted-foreground">
            {item.description}
          </p>
        </CardContent>
        <CardFooter className="mt-auto px-5 pb-5 pt-0">
          {item.detailsHref && item.detailsTab && onRequestTab ? (
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={() => {
                onRequestTab(item.detailsTab!);
                const id = item.detailsHref!.replace(/^#/, "");
                if (!id) return;
                window.requestAnimationFrame(() => {
                  window.setTimeout(() => {
                    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 50);
                });
              }}
            >
              {detailsLabel}
            </Button>
          ) : item.detailsHref ? (
            <Button variant="success" size="sm" asChild>
              <Link href={item.detailsHref}>{detailsLabel}</Link>
            </Button>
          ) : (
            <span className="cursor-default text-sm text-muted-foreground">
              {detailsLabel}
            </span>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
