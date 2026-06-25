"use client";

/**
 * Instructor-provided URL: /course/[courseId]/analyze
 * Consent → team name → repo selection with course_id + team_name tagging.
 */

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitFork, Github, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DashboardPreview } from "@/components/landing/DashboardPreview";
import { FeatureSections } from "@/components/landing/FeatureSections";
import { writeReportToSessionStorage } from "@/lib/reportLocalCache";
import type { RepoReport } from "@/lib/reportTypes";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browserConfigured";
import {
  buildOAuthCallbackUrl,
  getOAuthRedirectOrigin,
  stashOAuthNextPath,
} from "@/lib/oauthRedirectOrigin";

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

// ---------------------------------------------------------------------------
// Course metadata — maps slug → display info
// ---------------------------------------------------------------------------

const COURSE_META: Record<string, { fullName: string; term: string; description?: string }> = {
  "CSE115A-Summer26":    { fullName: "CSE 115A",             term: "Summer 2026" },
  "CSE115A-Fall26-S01":  { fullName: "CSE 115A — Section 01", term: "Fall 2026" },
  "CSE115A-Fall26-S02":  { fullName: "CSE 115A — Section 02", term: "Fall 2026" },
  "CSE115A-Winter26":    { fullName: "CSE 115A",             term: "Winter 2026" },
  "CSE115A-Spring26":    { fullName: "CSE 115A",             term: "Spring 2026" },
  "CSE115B-Winter26":    { fullName: "CSE 115B",             term: "Winter 2026" },
  "CSE115C-Spring26":    { fullName: "CSE 115C",             term: "Spring 2026" },
};

type StepNum = 1 | 2 | 3;

type StoredFlow = { step?: StepNum; teamName?: string };

function flowStorageKey(courseSlug: string): string {
  return `course-analyze-flow:${courseSlug}`;
}

export default function CourseAnalyzePage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const courseSlugParam =
    typeof params.courseId === "string" ? params.courseId.trim() : "";
  const courseIdDisplay = courseSlugParam
    ? decodeURIComponent(courseSlugParam)
    : "";

  const oauthNextPath =
    pathname?.startsWith("/course/") && pathname.endsWith("/analyze") ?
      pathname
    : courseSlugParam
      ? `/course/${encodeURIComponent(courseIdDisplay)}/analyze`
      : "/";

  const [step, setStep] = useState<StepNum>(1);
  const [teamName, setTeamName] = useState("");
  const [teamError, setTeamError] = useState<string | null>(null);

  const [dashLoading, setDashLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tokenErrorCode, setTokenErrorCode] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [dashUnauthorized, setDashUnauthorized] = useState(false);
  const [analyzingFullName, setAnalyzingFullName] = useState<string | null>(
    null,
  );

  const [signingIn, setSigningIn] = useState(false);

  /** Restore progress after OAuth (sessionStorage). */
  useEffect(() => {
    if (!courseSlugParam) return;
    try {
      const raw = sessionStorage.getItem(flowStorageKey(courseIdDisplay));
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredFlow;
      if (typeof parsed.teamName === "string") {
        setTeamName(parsed.teamName);
      }
      if (parsed.step === 2 || parsed.step === 3) {
        setStep(parsed.step);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, [courseSlugParam, courseIdDisplay]);

  useEffect(() => {
    if (!courseSlugParam) return;
    try {
      sessionStorage.setItem(
        flowStorageKey(courseIdDisplay),
        JSON.stringify({ step, teamName } satisfies StoredFlow),
      );
    } catch {
      /* quota */
    }
  }, [courseSlugParam, courseIdDisplay, step, teamName]);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    setFetchError(null);
    setTokenErrorCode(null);
    setDashUnauthorized(false);
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
      if (res.status === 401) {
        setDashUnauthorized(true);
        setData(null);
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
      setFetchError("Failed to load repositories");
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    void loadDashboard();
  }, [step, loadDashboard]);

  const handleGitHubOAuth = useCallback(async () => {
    if (!isBrowserSupabaseConfigured()) {
      toast.error("Sign-in is not configured on this host.");
      return;
    }
    setSigningIn(true);
    try {
      const supabase = createUserSupabaseBrowserClient();
      const origin = getOAuthRedirectOrigin();
      stashOAuthNextPath(oauthNextPath);
      await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: buildOAuthCallbackUrl(origin),
          scopes: "read:user user:email repo",
        },
      });
    } finally {
      setSigningIn(false);
    }
  }, [oauthNextPath]);

  const goTeamContinue = () => {
    const t = teamName.trim();
    if (!t) {
      setTeamError("Please enter a team name");
      return;
    }
    setTeamError(null);
    setStep(3);
  };

  const handleRepoClick = useCallback(
    async (repo: DashboardRepo) => {
      if (analyzingFullName) return;
      setAnalyzingFullName(repo.fullName);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            url: repo.htmlUrl,
            course_id: courseIdDisplay || null,
            team_name: teamName.trim(),
          }),
        });
        let body: {
          error?: string;
          hint?: string;
          resultId?: string;
          report?: RepoReport;
          code?: string;
        } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          toast.error("Analysis failed.");
          return;
        }
        if (!res.ok) {
          const base = body.error ?? "Analysis failed.";
          const msg =
            typeof body.hint === "string" && body.hint.trim() ?
              `${base} — ${body.hint}`
            : base;
          toast.error(msg);
          return;
        }
        const rid = body.resultId;
        if (!rid || typeof rid !== "string") {
          toast.error("Invalid response.");
          return;
        }
        if (body.report) {
          writeReportToSessionStorage(rid, body.report);
        }
        toast.success("Analysis complete");
        router.push(`/r/${encodeURIComponent(rid)}`);
      } finally {
        setAnalyzingFullName(null);
      }
    },
    [analyzingFullName, courseIdDisplay, router, teamName],
  );

  const courseMeta = COURSE_META[courseIdDisplay] ?? null;

  const cardOuter = useMemo(
    () =>
      "mx-auto w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-sm",
    [],
  );

  if (!courseSlugParam) {
    return (
      <div className={cardOuter}>
        <p className="text-center text-sm text-destructive">Invalid course URL.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Step 1 — hero + landing sections */}
      {step === 1 ? (
        <div className="w-full pb-16">
          {/* Hero content */}
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 pt-10 pb-4 text-center">
            {/* Term / course badge */}
            <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              {courseMeta ? courseMeta.term : courseIdDisplay}
            </span>

            {/* Gradient title */}
            <div className="space-y-2">
              <h1 className="text-5xl font-bold tracking-tight sm:text-6xl xl:text-7xl">
                <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
                  Repo Analytics
                </span>
              </h1>
              <p className="text-xl font-semibold text-muted-foreground">
                {courseMeta ? courseMeta.fullName : courseIdDisplay}
              </p>
            </div>

            {/* Description */}
            <p className="mx-auto max-w-xl text-base text-muted-foreground">
              {courseMeta
                ? `Repo Analytics helps ${courseMeta.fullName} teams reflect on their software engineering process. After selecting your project repository, the tool summarizes development activity, code structure, testing signals, and maintainability.`
                : "The repo analytics tool helps you reflect on your team's software engineering process. After selecting your project repository, the tool will summarize repository-level patterns such as development activity, code structure, testing signals, and maintainability."}
            </p>

            <Button className="w-full max-w-xs" onClick={() => setStep(2)} type="button">
              Get started
            </Button>
          </div>

          {/* Dashboard preview */}
          <div className="mx-auto mt-12 w-full max-w-5xl">
            <DashboardPreview />
          </div>

          {/* Feature sections */}
          <div className="mt-4">
            <FeatureSections />
          </div>
        </div>
      ) : null}

      {/* Step 2 */}
      {step === 2 ? (
        <div className="mx-auto w-full max-w-4xl py-8">
        <div className={cardOuter}>
          <h2 className="text-lg font-semibold">Enter your team name</h2>
          <label className="mt-4 block text-sm font-medium" htmlFor="team-name-field">
            Team or project name *
          </label>
          <input
            id="team-name-field"
            type="text"
            value={teamName}
            onChange={(e) => {
              setTeamName(e.target.value);
              if (teamError) setTeamError(null);
            }}
            placeholder="e.g. Team Rocket or project-slug"
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          />
          {teamError ? (
            <p className="mt-2 text-sm text-destructive">{teamError}</p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="button" onClick={goTeamContinue}>
              Continue
            </Button>
          </div>
        </div>
        </div>
      ) : null}

      {/* Step 3 */}
      {step === 3 ? (
        <div className="mx-auto w-full max-w-4xl py-8">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <span>
              <span className="font-medium text-foreground">Course:</span>{" "}
              <span>{courseIdDisplay}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="font-medium text-foreground">Team:</span>{" "}
              <span>{teamName.trim()}</span>
            </span>
            <button
              type="button"
              className="text-primary text-sm underline-offset-4 hover:underline"
              onClick={() => setStep(2)}
            >
              Edit
            </button>
          </div>

          {dashUnauthorized ? (
            <div className="flex w-full max-w-md mx-auto flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                Sign in with GitHub to analyze your repository. By using Repo Metrics, you agree to its{" "}
                <a href="/license" className="underline underline-offset-4 hover:text-foreground">license</a>{" "}
                and{" "}
                <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">privacy statement</a>.
              </p>
              <Button
                type="button"
                className="gap-2"
                disabled={signingIn}
                onClick={() => void handleGitHubOAuth()}
              >
                {signingIn ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Github className="size-4" aria-hidden />
                )}
                Sign in with GitHub
              </Button>
            </div>
          ) : dashLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading your GitHub repositories…</p>
            </div>
          ) : fetchError && !data ? (
            <div className={cardOuter}>
              <p className="text-sm text-destructive">{fetchError}</p>
              {(tokenErrorCode === "github_token_missing" ||
                tokenErrorCode === "github_unauthorized") && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Your GitHub token has expired. Please sign out and sign in again.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="outline" asChild>
                  <Link href="/">Back home</Link>
                </Button>
                <Button type="button" onClick={() => void loadDashboard()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : data?.profile ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
              <aside className="lg:col-span-4">
                <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm lg:items-stretch lg:text-left">
                  <div className="mx-auto size-28 shrink-0 overflow-hidden rounded-full border border-border bg-muted lg:mx-0">
                    <Image
                      src={data.profile.avatarUrl}
                      alt=""
                      width={112}
                      height={112}
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold tracking-tight">
                      {(data.profile.name?.trim() || data.profile.login) ?? ""}
                    </h2>
                    <a
                      href={data.profile.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 text-sm text-primary hover:underline lg:justify-start"
                    >
                      <Github className="size-4 shrink-0" aria-hidden />
                      {data.profile.login}
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Pick a repo below — analysis may take a minute.
                  </p>
                </div>
              </aside>
              <section className="lg:col-span-8">
                <h2 className="mb-4 text-lg font-semibold tracking-tight">Repositories</h2>
                {data.repos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No repositories returned. Try an account with repo access.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {data.repos.map((repo) => {
                      const busy = analyzingFullName === repo.fullName;
                      return (
                        <li key={repo.fullName}>
                          <button
                            type="button"
                            disabled={Boolean(analyzingFullName)}
                            onClick={() => void handleRepoClick(repo)}
                            className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-primary">{repo.name}</span>
                              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                {repo.private ? "Private" : "Public"}
                              </span>
                            </div>
                            {repo.description ? (
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {repo.description}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              {repo.language ? (
                                <span className="inline-flex items-center gap-1">
                                  <span
                                    className="size-2 rounded-full bg-blue-500"
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
                                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                  Analyzing…
                                </span>
                              ) : (
                                <span className="text-foreground">Click to analyze</span>
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
        </div>
      ) : null}
    </div>
  );
}
