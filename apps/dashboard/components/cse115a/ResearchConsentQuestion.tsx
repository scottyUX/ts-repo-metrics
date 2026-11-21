import { CONSENT_CHANGE_LINE, CONSENT_NO, CONSENT_TEXT, CONSENT_YES, splitEmails, type StoredConsent } from "@/lib/cse115a/consent";

/** "You said yes on November 20, 2026", or that there is no answer to the current wording yet. */
export function consentAnswerLine(consent: Pick<StoredConsent, "consented" | "updated_at"> | null): string {
  if (!consent) return "You have not answered yet.";
  const day = new Date(consent.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `You said ${consent.consented ? "yes" : "no"} on ${day}.`;
}

function WithEmailLinks({ text }: { text: string }) {
  return (
    <>
      {splitEmails(text).map((part, index) => part.email
        ? <a key={index} href={`mailto:${part.text}`} className="text-blue-700 underline">{part.text}</a>
        : <span key={index}>{part.text}</span>)}
    </>
  );
}

/**
 * The research consent question: the approved wording, the two choices, and the line under them.
 * Used by the course page (CourseDashboard) and by /cse115a/consent, so the two cannot drift.
 * `consent` is the answer to the current version only (see currentConsent); saving is the caller's,
 * through saveConsentAnswer.
 */
export function ResearchConsentQuestion({
  headingId,
  consent,
  saving,
  onAnswer,
  onCancel,
  showAnswer = false,
  saved = false,
}: {
  headingId: string;
  consent: StoredConsent | null;
  saving: boolean;
  onAnswer: (consented: boolean) => void;
  onCancel?: () => void;
  showAnswer?: boolean;
  saved?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-semibold">{CONSENT_TEXT.title}</h2>
      <div className="mt-1 max-w-3xl space-y-2 text-sm text-slate-600">
        <p><WithEmailLinks text={CONSENT_TEXT.opening} /></p>
        {CONSENT_TEXT.sections.map((section) => (
          <p key={section.label}><strong className="font-semibold text-slate-800">{section.label}</strong> <WithEmailLinks text={section.text} /></p>
        ))}
      </div>
      {showAnswer ? <p className="mt-4 text-sm font-medium text-slate-800">{consentAnswerLine(consent)}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={saving} onClick={() => onAnswer(true)} className={`rounded-lg px-4 py-2 text-left text-sm font-semibold disabled:opacity-50 ${consent?.consented ? "bg-slate-900 text-white" : "border border-slate-300"}`}>{CONSENT_YES}</button>
        <button type="button" disabled={saving} onClick={() => onAnswer(false)} className={`rounded-lg px-4 py-2 text-left text-sm font-semibold disabled:opacity-50 ${consent && !consent.consented ? "bg-slate-900 text-white" : "border border-slate-300"}`}>{CONSENT_NO}</button>
        {onCancel ? <button type="button" onClick={onCancel} className="px-2 text-sm text-slate-600 underline">Cancel</button> : null}
      </div>
      {saved ? <p role="status" className="mt-3 text-sm font-medium text-emerald-800">Your answer is saved.</p> : null}
      <p className="mt-3 text-sm text-slate-600">{CONSENT_CHANGE_LINE}</p>
    </section>
  );
}
