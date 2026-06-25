import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildOAuthCallbackUrl,
  getOAuthRedirectOrigin,
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
