"use client";

import { cn } from "@/lib/utils";
import { useCommitHabitsTabInsight } from "../CommitHabitsTabInsightContext";

const linkButtonClass =
  "font-inherit text-primary underline-offset-4 hover:text-primary/90 hover:underline";

const STATIC_LEAD =
  "Hold a steady commit rhythm—small integrations beat rare big drops, even when features feel “almost done.”";

const STATIC_BULLETS = [
  "Pair commits with tests or checks when you touch production logic.",
  "Balance ownership: share hot files so knowledge—and review load—doesn’t sit on one person.",
  "Prefer clear subjects and scoped diffs so history stays searchable.",
] as const;

export function CommitHabitsMomentumPanel({ className }: { className?: string }) {
  const ctx = useCommitHabitsTabInsight();

  const data = ctx?.data ?? null;
  const insightLoading = Boolean(ctx?.isLoading && !data);

  const accentLabel = data ? "Suggested focus" : "Keep going";
  const lead = insightLoading ? "Tailoring suggestions from your metrics…" : data?.momentumLead ?? STATIC_LEAD;
  const bullets = data?.momentumBullets ?? [...STATIC_BULLETS];

  return (
    <section
      id="commit-habits-momentum"
      aria-labelledby="commit-habits-momentum-heading"
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-card-foreground shadow-md ring-1 ring-border/60 sm:p-6",
        className,
      )}
    >
      <h2
        id="commit-habits-momentum-heading"
        className="text-lg font-semibold leading-6 tracking-tight text-foreground"
      >
        Keep the momentum going
      </h2>

      <div
        className={cn(
          "mt-4 rounded-lg border border-border bg-card px-4 py-3 sm:px-5 sm:py-4",
        )}
      >
        <p className="text-[11px] font-normal uppercase leading-normal tracking-wide text-primary">
          {accentLabel}
        </p>
        <p className="mt-3 text-sm font-normal leading-5 text-foreground">{lead}</p>
      </div>

      <p className="mt-6 text-xs font-normal uppercase leading-4 tracking-wide text-muted-foreground">
        Want to go further
      </p>

      <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-[22px] text-muted-foreground marker:text-muted-foreground">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ol>

      <p className="mt-5">
        <a href="#commit-habits-core-signals" className={cn("text-sm font-normal", linkButtonClass)}>
          → Explore all Commit Habits metrics in detail
        </a>
      </p>
    </section>
  );
}
