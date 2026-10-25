// Supabase reports a failed OAuth link in the URL hash (#error=...&error_code=...).
// Turn it into a message the student can act on, or null when there is no error.

const MESSAGES: Record<string, string> = {
  identity_already_exists:
    "That GitHub account is already linked to a different Repo Metrics account, probably from signing in with GitHub before. "
    + "Connect a different GitHub account, or ask your instructor to unlink the old one.",
  provider_email_needs_verification: "Verify your email on GitHub, then try again.",
};

export function oauthHashError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const error = params.get("error");
  if (!error) return null;
  const code = params.get("error_code");
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (error === "access_denied") return "GitHub wasn’t connected because access was denied. Try again and approve Repo Metrics.";
  const description = params.get("error_description");
  return description ? `Could not connect GitHub: ${description}.` : "Could not connect GitHub. Try again.";
}
