import { afterEach, describe, expect, it } from "vitest";
import { getDecryptedGitHubTokenForUser } from "@/lib/userGitHubToken";

describe("getDecryptedGitHubTokenForUser", () => {
  afterEach(() => {
    delete process.env.CSE115A_SITE;
  });

  it("does not read a stored token on the course site", async () => {
    process.env.CSE115A_SITE = "true";
    await expect(getDecryptedGitHubTokenForUser("user-1")).resolves.toBeNull();
  });
});
