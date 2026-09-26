import type { User } from "@supabase/supabase-js";

export const CSE115A_FALL_COURSE_IDS = new Set([
  "CSE115A-Fall26",
  "CSE115A-Fall26-S01",
  "CSE115A-Fall26-S02",
]);

export function verifiedUcscGoogleEmail(user: User | null): string | null {
  if (!user) return null;
  for (const identity of user.identities ?? []) {
    if (identity.provider !== "google") continue;
    const email = identity.identity_data?.email;
    if (typeof email !== "string" || !/^[^@\s]+@ucsc\.edu$/i.test(email)) continue;
    if (identity.identity_data?.email_verified !== true) continue;
    return email.toLowerCase();
  }
  return null;
}
