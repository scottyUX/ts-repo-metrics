"use client";

import Link from "next/link";
import { useState } from "react";
import { Github } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitHubRepositoryMeta } from "@/lib/reportTypes";
import { cn } from "@/lib/utils";

const EMPTY_GITHUB_META: GitHubRepositoryMeta = {
  description: null,
  topics: [],
  stargazersCount: 0,
  forksCount: 0,
  subscribersCount: 0,
  languages: [],
  contributors: [],
};

/** Approximate GitHub language bar colors (API does not send hex). */
const LANGUAGE_DOT_HEX: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  CSS: "#663399",
  HTML: "#e34c26",
  Python: "#3572A5",
  Ruby: "#701516",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C#": "#178600",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  Vue: "#41b883",
  SCSS: "#c6538c",
  Less: "#1d365d",
  PHP: "#4F5D95",
  Scala: "#c22d40",
};

const MAX_LANG_INLINE = 5;
const MAX_AVATARS = 5;

function languageDotColor(name: string): string {
  return LANGUAGE_DOT_HEX[name] ?? "#6e7781";
}

interface GitHubRepositoryPanelProps {
  meta: GitHubRepositoryMeta | null;
  repoUrl?: string;
  totalCommits?: number | null;
}

export function GitHubRepositoryPanel({
  meta,
  repoUrl,
  totalCommits,
}: GitHubRepositoryPanelProps) {
  const [contributorsOpen, setContributorsOpen] = useState(false);
  const metaUnavailable = meta === null;
  const m = meta ?? EMPTY_GITHUB_META;
  const langsSorted = [...m.languages].sort((a, b) => b.percentage - a.percentage);
  const langsShown = langsSorted.slice(0, MAX_LANG_INLINE);
  const langOverflow = langsSorted.length - langsShown.length;
  const contributorsSorted = [...m.contributors].sort(
    (a, b) => b.contributions - a.contributions,
  );
  const avatarsShown = contributorsSorted.slice(0, MAX_AVATARS);
  const avatarOverflow = contributorsSorted.length - avatarsShown.length;

  const commitsLabel =
    totalCommits != null && totalCommits >= 0 ? (
      <span className="shrink-0 text-sm text-muted-foreground">
        <span className="tabular-nums font-semibold text-foreground">
          {totalCommits}
        </span>{" "}
        commits
      </span>
    ) : (
      <span className="shrink-0 text-sm text-muted-foreground">Commits —</span>
    );

  return (
    <>
    <div
      className={cn(
        "flex min-h-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-md border border-border bg-muted px-4 py-3 sm:gap-x-6",
        metaUnavailable && "border-amber-500/35",
      )}
    >
      {repoUrl ? (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <Link href={repoUrl} target="_blank" rel="noopener noreferrer">
            <Github className="size-4" />
            Repo
          </Link>
        </Button>
      ) : null}

      {commitsLabel}

      <div className="min-w-0 flex-1">
        {!metaUnavailable && langsShown.length > 0 ? (
          <div
            className="flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden text-xs"
            title={langsSorted
              .map((r) => `${r.language} ${r.percentage.toFixed(1)}%`)
              .join(", ")}
          >
            {langsShown.map((row, i) => (
              <span
                key={row.language}
                className="flex shrink-0 items-center gap-1"
              >
                {i > 0 ? (
                  <span className="text-border select-none" aria-hidden>
                    ·
                  </span>
                ) : null}
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: languageDotColor(row.language) }}
                  aria-hidden
                />
                <span className="max-w-[5.5rem] truncate font-semibold text-foreground sm:max-w-none">
                  {row.language}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {row.percentage.toFixed(1)}%
                </span>
              </span>
            ))}
            {langOverflow > 0 ? (
              <span className="shrink-0 text-muted-foreground">
                <span className="text-border" aria-hidden>
                  ·
                </span>{" "}
                +{langOverflow}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {metaUnavailable
              ? "Language data needs GitHub metadata."
              : "No language data."}
          </p>
        )}
      </div>

      {!metaUnavailable && contributorsSorted.length > 0 ? (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 sm:gap-3">
          <AvatarGroup aria-label="Contributors">
            {avatarsShown.map((c) => {
              const tip = c.name
                ? `${c.login} (${c.name})`
                : c.login;
              return (
                <Tooltip key={c.login}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default">
                      <Avatar size="sm">
                        <AvatarImage src={c.avatarUrl} alt="" />
                        <AvatarFallback className="text-[10px]">
                          {c.login.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{tip}</TooltipContent>
                </Tooltip>
              );
            })}
            {avatarOverflow > 0 ? (
              <button
                type="button"
                onClick={() => setContributorsOpen(true)}
                className={cn(
                  "relative flex !size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background",
                  "transition-colors hover:bg-primary/15 hover:text-primary",
                )}
                aria-label={`View ${avatarOverflow} more contributors`}
              >
                +{avatarOverflow}
              </button>
            ) : null}
          </AvatarGroup>
          <button
            type="button"
            onClick={() => setContributorsOpen(true)}
            className="text-left text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            <span className="tabular-nums font-semibold text-foreground">
              {m.contributors.length}
            </span>{" "}
            contributor{m.contributors.length === 1 ? "" : "s"}
          </button>
        </div>
      ) : metaUnavailable ? (
        <p className="text-sm text-muted-foreground">Contributors —</p>
      ) : (
        <p className="text-sm text-muted-foreground">No contributor data.</p>
      )}

      {metaUnavailable ? (
        <p className="basis-full text-xs text-amber-600/90 dark:text-amber-400/90">
          GitHub metadata unavailable. Commits above are from analysis; language and
          contributor details need a successful GitHub API response.
        </p>
      ) : null}
    </div>

    {!metaUnavailable && contributorsSorted.length > 0 ? (
      <Sheet open={contributorsOpen} onOpenChange={setContributorsOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col border-border bg-background sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Contributors</SheetTitle>
            <SheetDescription>
              {m.contributors.length} people with commits on this repository
              (GitHub).
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="mt-2 h-[min(32rem,calc(100dvh-8rem))] pr-3">
            <ul className="space-y-1 pb-4" aria-label="All contributors">
              {contributorsSorted.map((c) => (
                <li key={c.login}>
                  <Link
                    href={c.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted"
                  >
                    <Avatar className="size-9 shrink-0">
                      <AvatarImage src={c.avatarUrl} alt="" />
                      <AvatarFallback>
                        {c.login.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {c.login}
                      </p>
                      {c.name ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {c.name}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {c.contributions} contribution
                        {c.contributions === 1 ? "" : "s"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    ) : null}
    </>
  );
}
