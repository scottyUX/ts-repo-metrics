"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ChevronDown,
  ExternalLink,
  Github,
  Loader2,
  LogOut,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createUserSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browserConfigured";
import { cn } from "@/lib/utils";

const GITHUB_REPO = "https://github.com/scottyUX/ts-repo-metrics";

type GitHubProfilePayload = {
  profile: {
    login: string;
    name: string | null;
    avatarUrl: string;
    htmlUrl: string;
    bio: string | null;
    followers: number;
    following: number;
    repoCountLabel: string;
  };
  orgs: Array<{ login: string; avatarUrl: string }>;
};

function initialsFrom(display: string): string {
  const parts = display.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  if (parts[0]?.length) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return "?";
}

function navLinkClass(active: boolean) {
  return cn(
    "shrink-0 whitespace-nowrap text-sm leading-5 transition-colors",
    active
      ? "font-medium text-[#fafafa]"
      : "text-[#a1a1a1] hover:text-[#fafafa]",
  );
}

function AvatarCircle({
  src,
  label,
  size,
}: {
  src: string | null;
  label: string;
  size: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? 24 : size === "md" ? 32 : 40;
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={dim}
        height={dim}
        className={cn(
          "shrink-0 rounded-full object-cover",
          size === "sm" && "size-6",
          size === "md" && "size-8",
          size === "lg" && "size-10",
        )}
        unoptimized
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[#262626] text-xs font-normal text-[#fafafa]",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8",
        size === "lg" && "size-10 text-sm",
      )}
    >
      {initialsFrom(label)}
    </span>
  );
}

export function HeaderNavClient() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ghPayload, setGhPayload] = useState<GitHubProfilePayload | null>(null);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghError, setGhError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isBrowserSupabaseConfigured()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const supabase = createUserSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isBrowserSupabaseConfigured()) return;
    const supabase = createUserSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  /** One fetch per signed-in user id; cached in state until sign-out or user change. */
  useEffect(() => {
    if (!user?.id || !isBrowserSupabaseConfigured()) {
      setGhPayload(null);
      setGhError(null);
      setGhLoading(false);
      return;
    }

    let cancelled = false;
    setGhLoading(true);
    setGhError(null);

    (async () => {
      try {
        const res = await fetch("/api/github/profile", {
          credentials: "include",
        });
        const body = (await res.json()) as GitHubProfilePayload & {
          error?: string;
          code?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setGhPayload(null);
          setGhError(body.error ?? "Could not load GitHub profile.");
          return;
        }
        if (body.profile && Array.isArray(body.orgs)) {
          setGhPayload({
            profile: body.profile,
            orgs: body.orgs,
          });
          setGhError(null);
        } else {
          setGhPayload(null);
          setGhError("Invalid response");
        }
      } catch {
        if (!cancelled) {
          setGhPayload(null);
          setGhError("Could not load GitHub profile.");
        }
      } finally {
        if (!cancelled) setGhLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const email = user?.email ?? null;
  const ghName =
    (user?.user_metadata?.user_name as string | undefined) ??
    (user?.user_metadata?.preferred_username as string | undefined) ??
    null;
  const displayName = ghName ?? email?.split("@")[0] ?? null;
  const signedIn = Boolean(user);
  const accountLabel = displayName ?? email ?? "";
  const triggerAvatarSrc = ghPayload?.profile.avatarUrl ?? null;

  async function signOut() {
    if (!isBrowserSupabaseConfigured()) return;
    const supabase = createUserSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setGhPayload(null);
    setGhError(null);
    router.push("/");
    router.refresh();
  }

  async function signIn() {
    if (!isBrowserSupabaseConfigured()) return;
    const supabase = createUserSupabaseBrowserClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${origin}/auth/callback?next=/repos`,
        scopes: "read:user user:email repo",
      },
    });
  }

  const fallbackGitHubProfileUrl =
    ghName != null && ghName !== "" ? `https://github.com/${ghName}` : null;
  const profileUrl =
    ghPayload?.profile.htmlUrl ?? fallbackGitHubProfileUrl ?? null;

  function accountMenu() {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex min-w-0 max-w-full shrink-0 items-center gap-2 rounded-md py-1 pr-1 text-left outline-none",
              "hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary/60",
            )}
            aria-label="Account menu"
          >
            <AvatarCircle
              src={triggerAvatarSrc}
              label={accountLabel}
              size="md"
            />
            <span className="hidden max-w-[9rem] truncate text-base font-medium text-[#fafafa] sm:inline">
              {displayName ?? email ?? "Account"}
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-[#fafafa]"
              aria-hidden
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-72 max-w-[calc(100vw-2rem)]"
        >
          {ghLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2
                className="size-6 animate-spin text-muted-foreground"
                aria-hidden
              />
              <span className="sr-only">Loading GitHub profile</span>
            </div>
          ) : null}

          {!ghLoading && ghPayload ? (
            <>
              <div className="flex gap-3 p-2">
                <AvatarCircle
                  src={ghPayload.profile.avatarUrl}
                  label={ghPayload.profile.login}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {ghPayload.profile.login}
                  </p>
                  {ghPayload.profile.name ? (
                    <p className="truncate text-sm text-muted-foreground">
                      {ghPayload.profile.name}
                    </p>
                  ) : null}
                </div>
              </div>
              {email ? (
                <p className="px-2 pb-2 text-xs text-muted-foreground">
                  {email}
                </p>
              ) : null}
              {ghPayload.profile.bio ? (
                <p className="line-clamp-2 px-2 pb-2 text-xs text-muted-foreground">
                  {ghPayload.profile.bio}
                </p>
              ) : null}
              <div className="flex items-center gap-1.5 px-2 pb-1 text-xs text-muted-foreground">
                <Users className="size-3.5 shrink-0 opacity-80" aria-hidden />
                <span>
                  {ghPayload.profile.followers} followers ·{" "}
                  {ghPayload.profile.following} following
                </span>
              </div>
              <p className="px-2 pb-2 text-xs text-muted-foreground">
                {ghPayload.profile.repoCountLabel}
              </p>
              {ghPayload.orgs.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                  {ghPayload.orgs.map((o) => (
                    <Image
                      key={o.login}
                      src={o.avatarUrl}
                      alt={o.login}
                      width={24}
                      height={24}
                      className="size-6 rounded-md object-cover"
                      title={o.login}
                      unoptimized
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {!ghLoading && !ghPayload ? (
            <>
              <div className="flex gap-3 p-2">
                <AvatarCircle src={null} label={accountLabel} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {displayName ?? "Account"}
                  </p>
                </div>
              </div>
              {email ? (
                <p className="px-2 pb-2 text-xs text-muted-foreground">
                  {email}
                </p>
              ) : null}
              {ghError ? (
                <p className="px-2 pb-2 text-xs text-amber-600 dark:text-amber-500">
                  {ghError}
                </p>
              ) : null}
            </>
          ) : null}

          {ghLoading && email ? (
            <p className="px-2 pb-2 text-xs text-muted-foreground">{email}</p>
          ) : null}

          <DropdownMenuSeparator />

          {profileUrl ? (
            <>
              <DropdownMenuItem asChild>
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer"
                >
                  <Github className="size-4" />
                  View profile on GitHub
                  <ExternalLink className="size-3.5 opacity-70" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-4 sm:gap-6 lg:gap-8">
      {loading ? (
        <div
          className="h-8 w-24 shrink-0 animate-pulse rounded-md bg-[#262626]"
          aria-hidden
        />
      ) : !signedIn ? (
        <Link
          href="/"
          className="shrink-0 text-base font-medium tracking-tight text-[#fafafa] transition-colors hover:text-white"
        >
          Repo Metrics
        </Link>
      ) : null}

      <nav
        className="flex min-w-0 flex-1 items-center gap-x-5 gap-y-2 overflow-x-auto sm:gap-x-6 lg:gap-x-8 [&::-webkit-scrollbar]:h-1"
        aria-label="Main"
      >
        {signedIn ? (
          <Link href="/repos" className={navLinkClass(pathname === "/repos")}>
            My Repos
          </Link>
        ) : null}
        <Link href="/docs" className={navLinkClass(pathname === "/docs")}>
          Docs
        </Link>
        <Link
          href="/resources"
          className={navLinkClass(pathname === "/resources")}
        >
          Resources
        </Link>
        <Link
          href="/research"
          className={navLinkClass(pathname === "/research")}
        >
          Research
        </Link>
        <Link
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(navLinkClass(false), "inline-flex items-center gap-1.5")}
        >
          <ExternalLink className="size-4 shrink-0 opacity-80" aria-hidden />
          GitHub
        </Link>
      </nav>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span
          id="repo-coach-header-slot"
          className="inline-flex min-w-0 empty:hidden"
        />
        <ThemeToggle variant="nav" />

        {!loading && !isBrowserSupabaseConfigured() ? (
          <span
            className="max-w-[5.5rem] truncate text-right text-[10px] leading-tight text-[#a1a1a1] sm:max-w-[10rem] sm:text-xs"
            title="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the host (e.g. Vercel), then redeploy so the Sign in button appears."
          >
            Sign in unavailable
          </span>
        ) : null}

        {!loading && isBrowserSupabaseConfigured() && !signedIn ? (
          <button
            type="button"
            onClick={() => void signIn()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#262626] bg-[rgba(38,38,38,0.3)] px-2.5 py-2 text-xs font-medium text-[#fafafa] transition-colors hover:bg-primary/20 sm:px-3 sm:text-sm"
          >
            <Github className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Sign in</span>
          </button>
        ) : null}

        {!loading && signedIn ? accountMenu() : null}
      </div>
    </div>
  );
}
