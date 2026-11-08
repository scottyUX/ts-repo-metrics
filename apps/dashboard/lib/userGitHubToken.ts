/**
 * Load decrypted GitHub OAuth token for a user (server-only, service role).
 */

import { decryptGitHubAccessToken } from "@/lib/githubTokenCrypto";
import { getSupabase } from "@/lib/supabase/server";

export async function getDecryptedGitHubTokenForUser(
  userId: string,
): Promise<string | null> {
  // The course site reads repositories through its GitHub App. A stored user token stays unused.
  if (process.env.CSE115A_SITE === "true") return null;

  const { data, error } = await getSupabase()
    .from("user_github_tokens")
    .select("encrypted_access_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.encrypted_access_token) {
    return null;
  }

  try {
    return decryptGitHubAccessToken(data.encrypted_access_token);
  } catch {
    return null;
  }
}
