import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { verifiedUcscGoogleEmail } from "@/lib/courseUcscAuth";

function user(provider: string, email: string, emailVerified: boolean): User {
  return {
    identities: [{ provider, identity_data: { email, email_verified: emailVerified } }],
  } as unknown as User;
}

describe("CSE 115A UCSC Google identity", () => {
  it("accepts a verified UCSC Google identity", () => {
    expect(verifiedUcscGoogleEmail(user("google", "Student@UCSC.EDU", true)))
      .toBe("student@ucsc.edu");
  });

  it("rejects an unverified address and a lookalike domain", () => {
    expect(verifiedUcscGoogleEmail(user("google", "student@ucsc.edu", false))).toBeNull();
    expect(verifiedUcscGoogleEmail(user("google", "student@ucsc.edu.evil.com", true))).toBeNull();
  });

  it("does not accept a GitHub profile email as Google authentication", () => {
    expect(verifiedUcscGoogleEmail(user("github", "student@ucsc.edu", true))).toBeNull();
  });
});
