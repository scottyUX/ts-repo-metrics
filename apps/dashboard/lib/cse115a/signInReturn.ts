// Where a student lands after UCSC Google sign-in.
//
// The dashboard, unless the sign-in started on the consent page. Only that one fixed path can be
// returned to: the requested value must equal it exactly, so an outside address, any other path,
// or a path with "//" or "\" falls back to the dashboard. The result is a constant from this file,
// never the caller's string, and is carried to /auth/callback in the existing
// repo_metrics_oauth_next cookie (set in the browser by UcscGoogleButton).

export const CSE115A_DASHBOARD_PATH = "/cse115a/dashboard";
export const CSE115A_CONSENT_PATH = "/cse115a/consent";

export function signInReturnPath(requested: unknown): string {
  return requested === CSE115A_CONSENT_PATH ? CSE115A_CONSENT_PATH : CSE115A_DASHBOARD_PATH;
}
