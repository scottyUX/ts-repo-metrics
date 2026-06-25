/** Cookie name for post-OAuth redirect path (avoids ?next= on redirectTo URL). */
export const OAUTH_NEXT_COOKIE = "repo_metrics_oauth_next";

const OAUTH_NEXT_MAX_AGE_SEC = 600;

/**
 * Origin used for Supabase OAuth redirectTo.
 * In dev, LAN / 127.0.0.1 hosts are normalized to localhost so they match
 * Supabase redirect URL allow-list entries (Site URL fallback otherwise sends
 * users to production Railway).
 */
export function getOAuthRedirectOrigin(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : "";

  if (process.env.NODE_ENV === "development") {
    const isLocalAlias =
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);

    if (isLocalAlias) {
      return `${protocol}//localhost${portSuffix}`;
    }
  }

  return window.location.origin;
}

/** Supabase allow-list entries are exact paths — omit query params from redirectTo. */
export function buildOAuthCallbackUrl(origin: string): string {
  return `${origin}/auth/callback`;
}

/** Remember where to send the user after /auth/callback (server reads this cookie). */
export function stashOAuthNextPath(nextPath: string): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(nextPath.startsWith("/") ? nextPath : `/${nextPath}`);
  document.cookie = `${OAUTH_NEXT_COOKIE}=${value}; path=/; max-age=${OAUTH_NEXT_MAX_AGE_SEC}; SameSite=Lax`;
}

export function readOAuthNextPathFromCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return "/repos";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${OAUTH_NEXT_COOKIE}=([^;]*)`),
  );
  if (!match?.[1]) return "/repos";
  try {
    const decoded = decodeURIComponent(match[1].trim());
    return decoded.startsWith("/") ? decoded : "/repos";
  } catch {
    return "/repos";
  }
}

export function clearOAuthNextCookieHeader(): string {
  return `${OAUTH_NEXT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
