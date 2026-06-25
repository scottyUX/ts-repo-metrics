/**
 * Public site origin for redirects (OAuth callback, etc.).
 * Behind Railway/Docker, `request.url` often reflects 0.0.0.0:PORT — unusable in Location headers.
 */

const INTERNAL_HOST_RE =
  /^(0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

function trimOrigin(raw: string): string {
  return raw.replace(/\/$/, "").trim();
}

export function getPublicOriginFromRequest(request: Request): string {
  const hostHeader = request.headers.get("host")?.trim();
  const host = hostHeader?.split(",")[0]?.trim() ?? "";
  const isLocalDevHost =
    process.env.NODE_ENV === "development" &&
    /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);

  // In local dev, prefer the request host over APP_ORIGIN (often set to Railway).
  if (!isLocalDevHost) {
    const explicit =
      process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (explicit) {
      return trimOrigin(explicit);
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const forwarded = forwardedHost.split(",")[0]?.trim();
    const proto =
      forwardedProto?.split(",")[0]?.trim() || "https";
    if (forwarded) {
      return `${proto}://${forwarded}`;
    }
  }

  if (hostHeader) {
    const resolvedHost = hostHeader.split(",")[0]!.trim();
    if (INTERNAL_HOST_RE.test(resolvedHost)) {
      return `http://${resolvedHost}`;
    }
    let proto = forwardedProto?.split(",")[0]?.trim();
    if (!proto) {
      proto = resolvedHost.includes("localhost") ? "http" : "https";
    }
    return `${proto}://${resolvedHost}`;
  }

  return new URL(request.url).origin;
}
