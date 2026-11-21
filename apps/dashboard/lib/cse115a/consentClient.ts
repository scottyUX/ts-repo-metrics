import type { StoredConsent } from "@/lib/cse115a/consent";

/**
 * Saves a research consent answer through the one consent API (PUT /api/cse115a/consent).
 * The course page and /cse115a/consent both call this, so an answer given in either place
 * is the same stored row.
 */
export async function saveConsentAnswer(courseSlug: string, consented: boolean, fetchImpl: typeof fetch = fetch): Promise<StoredConsent> {
  const response = await fetchImpl("/api/cse115a/consent", {
    method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ courseSlug, consented }),
  });
  const body = await response.json().catch(() => ({})) as { consent?: StoredConsent; error?: string };
  if (!response.ok || !body.consent) throw new Error(body.error ?? "Could not save your choice.");
  return body.consent;
}
