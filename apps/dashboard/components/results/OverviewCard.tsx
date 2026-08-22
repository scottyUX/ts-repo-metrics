"use client";

import type { KeyboardEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
  /** Accessible name for the card action. Defaults to “View {title} details”. */
  detailsLabel?: string;
  detailsHref?: string;
  /** When set, activate this results tab before following `detailsHref` (hash scroll). */
  detailsTab?: ResultsTabId;
}

const tierPositive = {
  badgeClassName:
    "border-transparent bg-status-positive/12 font-medium text-status-positive",
  scoreClassName: "text-status-positive",
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
      "border-transparent bg-status-warning/12 font-medium text-status-warning",
    scoreClassName: "text-status-warning",
  },
  critical: {
    label: "Critical",
    badgeClassName:
      "border-transparent bg-status-critical/12 font-medium text-status-critical",
    scoreClassName: "text-status-critical",
  },
};

interface OverviewCardProps {
  item: OverviewCardItem;
  selected?: boolean;
  className?: string;
  onRequestTab?: (tab: ResultsTabId) => void;
}

function activateCard(
  item: OverviewCardItem,
  onRequestTab?: (tab: ResultsTabId) => void,
) {
  if (item.detailsTab && onRequestTab) {
    onRequestTab(item.detailsTab);
  }
  const href = item.detailsHref;
  if (!href) return;
  const id = href.replace(/^#/, "");
  if (!id || id === href) return;
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  });
}

export function OverviewCard({ item, selected = false, className, onRequestTab }: OverviewCardProps) {
  const tier = tierMeta[item.tier];
  const detailsLabel = item.detailsLabel ?? `View ${item.title} details`;
  const isInteractive = Boolean(item.detailsHref);
  const usesTabSwitch = Boolean(item.detailsHref && item.detailsTab && onRequestTab);

  const focusRingClassName =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const cardClassName = cn(
    OVERVIEW_CARD_ASPECT_CLASS,
    "flex min-h-0 w-full flex-col gap-0 overflow-visible rounded-md border py-0 shadow-none transition-colors duration-150",
    selected ? "border-status-critical" : "border-border",
    isInteractive && "cursor-pointer hover:bg-card-hover",
    isInteractive && !selected && "hover:border-[#afb8c1] dark:hover:border-[#6e7681]",
  );

  const body = (
    <>
      <CardHeader className="gap-2 space-y-0 px-5 pb-3 pt-5">
        <CardTitle className="text-sm font-semibold leading-snug tracking-tight text-card-foreground">
          {item.title}
        </CardTitle>
        <Badge variant="outline" className={cn("w-fit border-0 font-medium", tier.badgeClassName)}>
          {tier.label}
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-5 pb-5 pt-0">
        {item.score !== null ? (
          <p
            className={cn(
              "text-[2rem] font-bold leading-none tabular-nums tracking-tight sm:text-4xl",
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
        <p className="text-sm leading-snug text-muted-foreground">{item.description}</p>
      </CardContent>
    </>
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateCard(item, onRequestTab);
    }
  };

  return (
    <div className={cn("relative w-full pt-3", className)}>
      {selected ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 -translate-y-1/2"
          aria-hidden
        >
          <span className="rounded-md border border-status-critical/40 bg-status-critical/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-critical">
            Start here
          </span>
        </div>
      ) : null}

      {usesTabSwitch ? (
        <Card
          role="button"
          tabIndex={0}
          aria-label={detailsLabel}
          className={cn(cardClassName, focusRingClassName)}
          onClick={() => activateCard(item, onRequestTab)}
          onKeyDown={handleKeyDown}
        >
          {body}
        </Card>
      ) : item.detailsHref ? (
        <Link
          href={item.detailsHref}
          aria-label={detailsLabel}
          className={cn("block rounded-md", focusRingClassName)}
        >
          <Card className={cardClassName}>{body}</Card>
        </Link>
      ) : (
        <Card className={cardClassName}>{body}</Card>
      )}
    </div>
  );
}
