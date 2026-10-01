import { describe, expect, it } from "vitest";
import { oauthHashError } from "@/lib/cse115a/oauthError";

describe("oauthHashError", () => {
  it("returns null without an error", () => {
    expect(oauthHashError("")).toBeNull();
    expect(oauthHashError("#access_token=abc")).toBeNull();
  });

  it("explains an identity that is linked to another user", () => {
    const hash = "#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user&sb=";
    expect(oauthHashError(hash)).toMatch(/already linked to a different Repo Metrics account/);
  });

  it("explains a denied grant", () => {
    expect(oauthHashError("#error=access_denied&error_description=denied")).toMatch(/access was denied/);
  });

  it("falls back to the provider description", () => {
    expect(oauthHashError("#error=server_error&error_description=Something+broke")).toBe("Could not connect GitHub: Something broke.");
  });
});
