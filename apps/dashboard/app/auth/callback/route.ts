import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  encryptGitHubAccessToken,
  isGitHubTokenEncryptionConfigured,
} from "@/lib/githubTokenCrypto";
import {
  clearOAuthNextCookieHeader,
  readOAuthNextPathFromCookie,
} from "@/lib/oauthRedirectOrigin";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  supabaseAnonKeyNode,
  supabaseProjectUrlNode,
} from "@/lib/supabase/projectEnv";
import { getPublicOriginFromRequest } from "@/lib/publicOrigin";

function redirectWithClearedNextCookie(origin: string, path: string): NextResponse {
  const response = NextResponse.redirect(`${origin}${path}`);
  response.headers.append("Set-Cookie", clearOAuthNextCookieHeader());
  return response;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getPublicOriginFromRequest(request);
  const code = searchParams.get("code");
  const cookieHeader = request.headers.get("cookie");
  const nextPath =
    searchParams.get("next") ??
    readOAuthNextPathFromCookie(cookieHeader);

  if (!code) {
    return redirectWithClearedNextCookie(origin, nextPath);
  }

  const url = supabaseProjectUrlNode();
  const anonKey = supabaseAnonKeyNode();
  if (!url || !anonKey) {
    return redirectWithClearedNextCookie(
      origin,
      `${nextPath}?auth_error=missing_supabase`,
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* ignore */
        }
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return redirectWithClearedNextCookie(
      origin,
      `${nextPath}?auth_error=exchange`,
    );
  }

  const providerToken = data.session.provider_token;
  const userId = data.session.user.id;

  if (
    providerToken &&
    isSupabaseConfigured() &&
    isGitHubTokenEncryptionConfigured()
  ) {
    try {
      const encrypted = encryptGitHubAccessToken(providerToken);
      await getSupabase().from("user_github_tokens").upsert(
        {
          user_id: userId,
          encrypted_access_token: encrypted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    } catch (err) {
      console.error("[auth/callback] Failed to persist GitHub token:", err);
    }
  } else if (providerToken && !isGitHubTokenEncryptionConfigured()) {
    console.warn(
      "[auth/callback] GITHUB_OAUTH_ENCRYPTION_KEY not set; GitHub token not stored.",
    );
  }

  return redirectWithClearedNextCookie(origin, nextPath);
}
