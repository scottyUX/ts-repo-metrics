/**
 * GET /api/github/repos/[owner]/[repo]/targets
 * Open/closed pull requests, branches, and default branch for the target picker.
 */

import { NextResponse } from "next/server";
import {
  createUserSupabaseServerClient,
  isUserSupabaseConfigured,
} from "@/lib/supabase/server-user";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getDecryptedGitHubTokenForUser } from "@/lib/userGitHubToken";
import type { RepoTargetPull, RepoTargets } from "@/lib/github/analyzeRef";

export const runtime = "nodejs";

const GITHUB_API = "https://api.github.com";
const MAX_PULLS = 50;
const MAX_BRANCHES = 100;

function ghHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${token}`,
  };
}

function mapPull(raw: {
  number: number;
  title: string;
  state: string;
  head?: { ref?: string };
  base?: { ref?: string };
}): RepoTargetPull {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state === "open" ? "open" : "closed",
    headRef: raw.head?.ref ?? "",
    baseRef: raw.base?.ref ?? "",
  };
}

async function fetchPulls(
  owner: string,
  repo: string,
  token: string,
  state: "open" | "closed",
): Promise<RepoTargetPull[]> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=${state}&per_page=${MAX_PULLS}&sort=updated`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    throw new Error(`pulls:${res.status}`);
  }
  const batch = (await res.json()) as Array<{
    number: number;
    title: string;
    state: string;
    head?: { ref?: string };
    base?: { ref?: string };
  }>;
  return batch.slice(0, MAX_PULLS).map(mapPull);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    if (!isUserSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Authentication is not configured." },
        { status: 503 },
      );
    }

    const userSb = await createUserSupabaseServerClient();
    const {
      data: { user },
    } = await userSb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Server storage is not configured.", code: "supabase_missing" },
        { status: 503 },
      );
    }

    const token = await getDecryptedGitHubTokenForUser(user.id);
    if (!token) {
      return NextResponse.json(
        {
          error:
            "GitHub token not available. Sign out and sign in again with GitHub.",
          code: "github_token_missing",
        },
        { status: 403 },
      );
    }

    const { owner, repo } = await context.params;
    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing owner or repo." }, { status: 400 });
    }

    const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: ghHeaders(token),
    });
    if (repoRes.status === 401) {
      return NextResponse.json(
        {
          error: "GitHub rejected the token. Sign out and sign in again.",
          code: "github_unauthorized",
        },
        { status: 403 },
      );
    }
    if (!repoRes.ok) {
      return NextResponse.json(
        { error: "Failed to load repository." },
        { status: 502 },
      );
    }
    const repoJson = (await repoRes.json()) as { default_branch?: string };
    const defaultBranch = repoJson.default_branch ?? "main";

    const [openPulls, closedPulls, branchesRes] = await Promise.all([
      fetchPulls(owner, repo, token, "open"),
      fetchPulls(owner, repo, token, "closed"),
      fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/branches?per_page=${MAX_BRANCHES}`,
        { headers: ghHeaders(token) },
      ),
    ]);

    if (!branchesRes.ok) {
      return NextResponse.json(
        { error: "Failed to load branches." },
        { status: 502 },
      );
    }
    const branchJson = (await branchesRes.json()) as Array<{ name: string }>;
    const payload: RepoTargets = {
      defaultBranch,
      branches: branchJson.map((b) => ({ name: b.name })),
      openPulls,
      closedPulls,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[github/targets]", err);
    return NextResponse.json(
      { error: "Failed to load pull requests and branches." },
      { status: 502 },
    );
  }
}
