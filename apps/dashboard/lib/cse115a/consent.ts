// Research consent for using a student's CSE 115A code in the Hecate Benchmark.
//
// The wording and its version live only here. CONSENT_TEXT is the approved wording
// (2026-11-20), which replaced the placeholder, so CONSENT_VERSION changed and every
// student is asked again: answers are recorded with the version shown, and only
// answers to the current version count. If the wording changes again, bump
// CONSENT_VERSION. The course page and /cse115a/consent both render this through
// components/cse115a/ResearchConsentQuestion.tsx.

export const CONSENT_APPROVED = true;

export const CONSENT_VERSION = "2026-11-20";

export type ConsentSection = { label: string; text: string };
export type ConsentWording = { title: string; opening: string; sections: readonly ConsentSection[] };

/** The approved wording, word for word. Email addresses in it render as mailto: links. */
export const CONSENT_TEXT: ConsentWording = {
  title: "Hecate Benchmark: research participation",
  opening: "The Hecate Lab at UC Santa Cruz studies how well AI coding tools work on real software projects. We are asking whether we may use the code you write in this course for that research.",
  sections: [
    {
      label: "What we would collect.",
      text: "Code you commit to your team repository this quarter, including commit history, branches and tags; your pull requests and the code reviews on them; your tests; your sprint task files; and Repo Metrics results for your commits.",
    },
    {
      label: "How we would use it.",
      text: "We would analyze your code and how it changes over the quarter, build benchmark items from it, run AI coding agents on those items, and compare their work with yours. Parts of your code may be published as part of a public benchmark and leaderboard, described in research papers, and used to train and evaluate AI model-routing systems. Before release, we remove names, emails, usernames and other identifying details from code, comments and commit history.",
    },
    {
      label: "It's voluntary.",
      text: "You do the same coursework either way. Whether you take part has no effect on your grade, and neither does whether your code is chosen, which AI tools you used, or how any AI tool performs on your work.",
    },
    {
      label: "You can change your mind.",
      text: "You can withdraw at any time before the course ends by emailing okdogulu@ucsc.edu.",
    },
    {
      label: "Risks and benefits.",
      text: "The risk is that published code could be traced back to you. We reduce that risk by removing identifiers before release. You get no direct benefit, but your work helps make AI coding tools measurable on real software work.",
    },
    {
      label: "Questions.",
      text: "Contact okdogulu@ucsc.edu. For questions about your rights as a research participant, contact the UCSC Office of Research Compliance Administration at orca@ucsc.edu.",
    },
  ],
};

/** The two choices, everywhere the question is asked. */
export const CONSENT_YES = "I agree to let the Hecate Lab use my CSE 115A code as described above.";
export const CONSENT_NO = "I do not agree.";

/** The one line under the choices. Withdrawal by email (in the text) still works; this does not contradict it. */
export const CONSENT_CHANGE_LINE = "You can change your answer at any time on this page.";

export type StoredConsent = { course_id: string; consented: boolean; consent_version: string; updated_at: string };

/** True when a stored answer is a "yes" to the current, approved wording. */
export function countsAsConsent(row: { consented: boolean; consent_version: string } | null | undefined): boolean {
  return CONSENT_APPROVED && Boolean(row?.consented) && row?.consent_version === CONSENT_VERSION;
}

/** The student's answer for a course, or null when there is none or it was given to older wording. */
export function currentConsent<T extends { course_id: string; consent_version: string }>(rows: readonly T[] | null | undefined, courseId: string | null | undefined): T | null {
  const row = rows?.find((item) => item.course_id === courseId) ?? null;
  return row?.consent_version === CONSENT_VERSION ? row : null;
}

/** Splits text into plain parts and email addresses, so addresses can render as mailto: links. */
export function splitEmails(text: string): Array<{ text: string; email: boolean }> {
  return text.split(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/).filter(Boolean)
    .map((part) => ({ text: part, email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(part) }));
}
