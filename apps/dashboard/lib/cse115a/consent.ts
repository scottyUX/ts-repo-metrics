// Research consent for using a student's final tasks in a published benchmark.
//
// TODO(IRB): replace CONSENT_TEXT with the IRB-approved wording, set
// CONSENT_VERSION to that version's identifier, and set CONSENT_APPROVED.
// Answers are recorded with the version shown; only answers to the current,
// approved version count, so students are asked again when it changes.

export const CONSENT_APPROVED = false;

export const CONSENT_VERSION = "placeholder";

export const CONSENT_TEXT = "[Placeholder: the IRB-approved research consent wording goes here.] Your instructors would like to include your final task PRs in a research dataset of software engineering tasks. Saying no does not affect your grade, and you can change your answer at any time.";

/** True when a stored answer is a "yes" to the current, approved wording. */
export function countsAsConsent(row: { consented: boolean; consent_version: string } | null | undefined): boolean {
  return CONSENT_APPROVED && Boolean(row?.consented) && row?.consent_version === CONSENT_VERSION;
}
