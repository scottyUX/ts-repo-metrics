import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildOAuthCallbackUrl,
  getOAuthRedirectOrigin,
  oauthNextPath,
  readOAuthNextPathFromCookie,
  stashOAuthNextPath,
} from "@/lib/oauthRedirectOrigin";

describe("getOAuthRedirectOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns window origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        hostname: "10.0.0.5",
        port: "3000",
        origin: "https://10.0.0.5:3000",
      },
    });

    expect(getOAuthRedirectOrigin()).toBe("https://10.0.0.5:3000");
  });

  it("normalizes LAN IP to localhost in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("window", {
      location: {
        protocol: "http:",
        hostname: "10.0.0.165",
        port: "3000",
        origin: "http://10.0.0.165:3000",
      },
    });

    expect(getOAuthRedirectOrigin()).toBe("http://localhost:3000");
  });

  it("builds callback URL without query params", () => {
    expect(buildOAuthCallbackUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/callback",
    );
  });
});

describe("oauth next cookie", () => {
  it("reads stashed next path from cookie header", () => {
    expect(
      readOAuthNextPathFromCookie("repo_metrics_oauth_next=%2Frepos; other=1"),
    ).toBe("/repos");
  });

  it("defaults when cookie missing", () => {
    expect(readOAuthNextPathFromCookie(null)).toBe("/repos");
  });

  it("stash sets document cookie", () => {
    vi.stubGlobal("document", { cookie: "" });
    stashOAuthNextPath("/repos");
    expect(document.cookie).toContain("repo_metrics_oauth_next=%2Frepos");
  });
});

describe("oauthNextPath", () => {
  const cookie = "repo_metrics_oauth_next=%2Fcse115a%2Fdashboard";

  it("uses a ?next= path on this site", () => {
    expect(oauthNextPath("/cse115a/consent", cookie)).toBe("/cse115a/consent");
  });

  it("falls back to the cookie without ?next=", () => {
    expect(oauthNextPath(null, cookie)).toBe("/cse115a/dashboard");
    expect(oauthNextPath(null, null)).toBe("/repos");
  });

  it("never sends someone to another host", () => {
    const origin = "https://course.example.app";
    for (const next of ["@evil.example", ".evil.example", "evil.example", "https://evil.example", ":443@evil.example", "", "//evil.example", "/\\evil.example"]) {
      const path = oauthNextPath(next, cookie);
      expect(new URL(`${origin}${path}`).host).toBe("course.example.app");
    }
    expect(oauthNextPath("@evil.example", cookie)).toBe("/cse115a/dashboard");
  });
});
