import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const {
  CourseRepoAccessError, courseRepoReader, courseRepoToken, githubAppConfig, githubAppInstallUrl, githubAppJwt, githubLoginOf, repoInstallationToken,
} = await import("@/lib/cse115a/githubApp");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const config = { appId: "12345", privateKey: pem, slug: "course-repo-metrics" };

type Call = { url: string; method: string; auth: string; body?: string };

/** A fake GitHub API: `routes` maps "METHOD path" to a status and JSON body. */
function fakeGitHub(routes: Record<string, { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string>;
    calls.push({ url, method, auth: headers.Authorization ?? "", body: init?.body as string | undefined });
    const route = routes[`${method} ${url.replace("https://api.github.com", "")}`];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();

describe("githubAppConfig", () => {
  it("accepts a PEM with escaped newlines or base64", () => {
    const escaped = githubAppConfig({ GITHUB_APP_ID: "1", GITHUB_APP_SLUG: "s", GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, "\\n") } as unknown as NodeJS.ProcessEnv);
    expect(escaped?.privateKey).toBe(pem);
    const base64 = githubAppConfig({ GITHUB_APP_ID: "1", GITHUB_APP_SLUG: "s", GITHUB_APP_PRIVATE_KEY: Buffer.from(pem).toString("base64") } as unknown as NodeJS.ProcessEnv);
    expect(base64?.privateKey).toBe(pem);
    expect(githubAppConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("builds the install link from the slug", () => {
    expect(githubAppInstallUrl(config)).toBe("https://github.com/apps/course-repo-metrics/installations/new");
    expect(githubAppInstallUrl(null)).toBeNull();
  });
});

describe("githubAppJwt", () => {
  it("signs a 10-minute RS256 token issued by the app", () => {
    const now = Date.UTC(2026, 9, 14, 12);
    const [header, payload, signature] = githubAppJwt(config, now).split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    expect(claims).toEqual({ iss: "12345", iat: now / 1000 - 60, exp: now / 1000 + 540 });
    expect(createVerify("RSA-SHA256").update(`${header}.${payload}`).verify(publicKey, signature!, "base64url")).toBe(true);
  });
});

describe("githubLoginOf", () => {
  it("reads the linked GitHub identity", () => {
    const user = { identities: [{ provider: "google", identity_data: {} }, { provider: "github", identity_data: { user_name: "octo-student" } }] } as unknown as User;
    expect(githubLoginOf(user)).toBe("octo-student");
    expect(githubLoginOf({ identities: [{ provider: "email", identity_data: {} }] } as unknown as User)).toBeNull();
  });
});

describe("repository access", () => {
  it("explains how to install the app when a repository does not have it", async () => {
    const { fetchImpl } = fakeGitHub({});
    const error = await repoInstallationToken("team", "missing-app", config, fetchImpl).catch((caught) => caught);
    expect(error).toBeInstanceOf(CourseRepoAccessError);
    expect(error.code).toBe("github_app_not_installed");
    expect(error.message).toContain("https://github.com/apps/course-repo-metrics/installations/new");
  });

  it("issues a token scoped to the one repository and reuses it", async () => {
    const { fetchImpl, calls } = fakeGitHub({
      "GET /repos/team/cached/installation": { status: 200, body: { id: 77 } },
      "POST /app/installations/77/access_tokens": { status: 201, body: { token: "ghs_cached", expires_at: inOneHour() } },
    });
    expect(await repoInstallationToken("team", "cached", config, fetchImpl)).toBe("ghs_cached");
    expect(await repoInstallationToken("Team", "Cached", config, fetchImpl)).toBe("ghs_cached");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ repositories: ["cached"] });
  });

  it("only gives a token to accounts that can push to the repository", async () => {
    const { fetchImpl } = fakeGitHub({
      "GET /repos/team/project/installation": { status: 200, body: { id: 5 } },
      "POST /app/installations/5/access_tokens": { status: 201, body: { token: "ghs_project", expires_at: inOneHour() } },
      "GET /repos/team/project/collaborators/member/permission": { status: 200, body: { permission: "write" } },
      "GET /repos/team/project/collaborators/owner/permission": { status: 200, body: { permission: "admin" } },
      // Anyone can read a public repository, so read access does not make someone a team member.
      "GET /repos/team/project/collaborators/reader/permission": { status: 200, body: { permission: "read" } },
    });
    expect(await courseRepoToken("member", "team", "project", config, fetchImpl)).toBe("ghs_project");
    expect(await courseRepoToken("owner", "team", "project", config, fetchImpl)).toBe("ghs_project");
    const reader = await courseRepoToken("reader", "team", "project", config, fetchImpl).catch((caught) => caught);
    expect(reader.code).toBe("github_not_collaborator");
    const outsider = await courseRepoToken("outsider", "team", "project", config, fetchImpl).catch((caught) => caught);
    expect(outsider.code).toBe("github_not_collaborator");
    const unlinked = await courseRepoToken(null, "team", "project", config, fetchImpl).catch((caught) => caught);
    expect(unlinked.code).toBe("github_not_linked");
    const unconfigured = await courseRepoToken("member", "team", "project", null, fetchImpl).catch((caught) => caught);
    expect(unconfigured.code).toBe("github_app_unconfigured");
  });

  it("reads each repository with its own token, checking access once", async () => {
    const { fetchImpl, calls } = fakeGitHub({
      "GET /repos/team/reader/installation": { status: 200, body: { id: 9 } },
      "POST /app/installations/9/access_tokens": { status: 201, body: { token: "ghs_reader", expires_at: inOneHour() } },
      "GET /repos/team/reader/collaborators/member/permission": { status: 200, body: { permission: "write" } },
      "GET /repos/team/reader/pulls/1": { status: 200, body: { number: 1 } },
      "GET /repos/team/reader/pulls/2": { status: 200, body: { number: 2 } },
    });
    const gh = courseRepoReader("member", config, fetchImpl);
    expect(await gh.json("/repos/team/reader/pulls/1")).toEqual({ number: 1 });
    expect(await gh.json("/repos/team/reader/pulls/2")).toEqual({ number: 2 });
    const reads = calls.filter((call) => call.url.includes("/pulls/"));
    expect(reads.map((call) => call.auth)).toEqual(["Bearer ghs_reader", "Bearer ghs_reader"]);
    expect(calls.filter((call) => call.url.includes("/collaborators/"))).toHaveLength(1);
  });
});
