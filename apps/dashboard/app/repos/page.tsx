"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitFork, Github, Loader2, Star } from "lucide-react";
import { AnalyzeRepositoryHero } from "@/components/analyze/AnalyzeRepositoryHero";
import { runAnalyzeFromUrl } from "@/lib/runAnalyze";

type DashboardProfile = {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  followers: number;
  following: number;
  publicRepos: number;
};

type DashboardRepo = {
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  updatedAt: string;
};

type DashboardPayload = {
  profile: DashboardProfile;
  repos: DashboardRepo[];
};

export default function ReposPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tokenErrorCode, setTokenErrorCode] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [analyzingFullName, setAnalyzingFullName] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError(null);
      setTokenErrorCode(null);
      try {
        const res = await fetch("/api/github/dashboard", {
          credentials: "include",
        });
        const body = (await res.json()) as {
          error?: string;
          code?: string;
          profile?: DashboardProfile;
          repos?: DashboardRepo[];
        };
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/");
          return;
        }
        if (!res.ok) {
          setFetchError(body.error ?? "Failed to load repositories");
          if (body.code) setTokenErrorCode(body.code);
          setData(null);
          return;
        }
        if (body.profile && body.repos) {
          setData({ profile: body.profile, repos: body.repos });
        } else {
          setFetchError("Invalid response");
        }
      } catch {
        if (!cancelled) setFetchError("Failed to load repositories");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const onRepoClick = useCallback(
    async (repo: DashboardRepo) => {
      if (analyzingFullName) return;
      setAnalyzingFullName(repo.fullName);
      try {
        const result = await runAnalyzeFromUrl(repo.htmlUrl);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Analysis complete");
        router.push(`/r/${encodeURIComponent(result.resultId)}`);
      } finally {
        setAnalyzingFullName(null);
      }
    },
    [analyzingFullName, router],
  );

  if (fetchError && !data && !loading) {
    return (
      <div className="flex w-full max-w-6xl flex-col items-center gap-14">
        <AnalyzeRepositoryHero compact />
        <div className="w-full max-w-lg space-y-4 rounded-md border border-border bg-card p-6 text-center">
          <p className="text-sm text-destructive">{fetchError}</p>
          {(tokenErrorCode === "github_token_missing" ||
            tokenErrorCode === "github_unauthorized") && (
            <p className="text-xs text-muted-foreground">
              Sign out, then sign in again with GitHub so we can refresh your
              token.
            </p>
          )}
          <Link
            href="/"
            className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to Analyze
          </Link>
        </div>
      </div>
    );
  }

  if (!data && !loading) {
    return null;
  }

  const profile = data?.profile;
  const repos = data?.repos ?? [];
  const displayName = profile
    ? profile.name?.trim() || profile.login
    : "";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-10">
      <div className="mx-auto flex w-full justify-center">
        <AnalyzeRepositoryHero compact />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading your GitHub…</p>
        </div>
      ) : profile ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <aside className="lg:col-span-3">
            <div className="flex flex-col items-center gap-3 lg:items-stretch">
              <div className="mx-auto size-24 shrink-0 overflow-hidden rounded-full border border-border bg-muted sm:size-32 lg:mx-0">
                <Image
                  src={profile.avatarUrl}
                  alt=""
                  width={128}
                  height={128}
                  className="size-full object-cover"
                />
              </div>
              <div className="space-y-0.5 text-center lg:text-left">
                <h1 className="text-xl font-semibold tracking-tight leading-tight">
                  {displayName}
                </h1>
                <a
                  href={profile.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 text-base text-muted-foreground hover:text-primary hover:underline lg:justify-start"
                >
                  <Github className="size-4 shrink-0" aria-hidden />
                  {profile.login}
                </a>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {profile.followers}
                </span>{" "}
                followers ·{" "}
                <span className="font-semibold text-foreground">
                  {profile.following}
                </span>{" "}
                following
              </p>
              <p className="text-xs text-muted-foreground">
                {profile.publicRepos} public repositories
              </p>
            </div>
          </aside>

          <section className="lg:col-span-9">
            <h2 className="mb-0 border-b border-border pb-2 text-sm font-semibold">
              Repositories
            </h2>
            {repos.length === 0 ? (
              <p className="pt-4 text-sm text-muted-foreground">
                No repositories returned. Try signing in with an account that
                has repo access.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {repos.map((repo) => {
                  const busy = analyzingFullName === repo.fullName;
                  return (
                    <li key={repo.fullName}>
                      <button
                        type="button"
                        disabled={Boolean(analyzingFullName)}
                        onClick={() => void onRepoClick(repo)}
                        className="flex w-full flex-col gap-1.5 py-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-base font-semibold text-primary">
                            {repo.name}
                          </span>
                          <span className="shrink-0 rounded-full border border-border px-2 py-px text-[11px] font-medium text-muted-foreground">
                            {repo.private ? "Private" : "Public"}
                          </span>
                        </div>
                        {repo.description ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {repo.description}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {repo.language ? (
                            <span className="inline-flex items-center gap-1">
                              <span
                                className="size-2.5 rounded-full bg-primary/70"
                                aria-hidden
                              />
                              {repo.language}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3.5" aria-hidden />
                            {repo.stargazersCount}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <GitFork className="size-3.5" aria-hidden />
                            {repo.forksCount}
                          </span>
                          {busy ? (
                            <span className="inline-flex items-center gap-1 text-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              Analyzing…
                            </span>
                          ) : (
                            <span>Click to analyze</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
