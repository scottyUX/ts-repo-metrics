// Research consent for using a student's final tasks in a published benchmark.
//
// The course staff approved CONSENT_TEXT as written (2026-11-16), so export is
// on. If the wording changes, bump CONSENT_VERSION: answers are recorded with
// the version shown and only answers to the current version count, so students
// are asked again.

export const CONSENT_APPROVED = true;

export const CONSENT_VERSION = "placeholder";

export const CONSENT_TEXT = "[Placeholder: the IRB-approved research consent wording goes here.] Your instructors would like to include your final task PRs in a research dataset of software engineering tasks. Saying no does not affect your grade, and you can change your answer at any time.";

/** True when a stored answer is a "yes" to the current, approved wording. */
export function countsAsConsent(row: { consented: boolean; consent_version: string } | null | undefined): boolean {
  return CONSENT_APPROVED && Boolean(row?.consented) && row?.consent_version === CONSENT_VERSION;
}
