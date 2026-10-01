import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Statement — Repo Metrics",
  description: "How Repo Metrics collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-10 pb-16">
      <header className="space-y-2 border-b border-border pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Statement</h1>
        <p className="text-sm text-muted-foreground">Effective date: May 2026</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="leading-relaxed text-muted-foreground">
          Repo Metrics is a research tool built to help software engineering students and
          instructors reflect on repository-level development patterns. This statement explains
          what data we collect when you use the tool, how we use it, and what rights you have
          over your information.
        </p>
        <p className="leading-relaxed text-muted-foreground">
          This tool is operated as part of research on AI-assisted software engineering
          education. Repository-level metrics from analyses may be used in anonymized, aggregate
          research. Course enrollment and task submissions identify a student to
          support the class workflow; research outputs use anonymized, aggregate
          data. <strong className="text-foreground">Repo Metrics scores are not used to grade individual students.</strong>
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Data we collect</h2>

        <div className="space-y-3">
          <h3 className="font-semibold">CSE 115A account and assignments</h3>
          <p className="leading-relaxed text-muted-foreground">
            The CSE 115A app uses Google sign-in to verify your UCSC email address.
            It stores that address with your course membership. When you submit a
            task PR, it stores the PR link, the committed task specification,
            process-check results, and the linked Repo Metrics analysis. Course
            codes are stored as hashes rather than plain text.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">GitHub account information</h3>
          <p className="leading-relaxed text-muted-foreground">
            When you sign in with GitHub, we receive your GitHub username, display name, avatar
            URL, and email address via OAuth. We use this to authenticate you and associate your
            analyses with your account. We also request <code className="rounded bg-muted px-1 text-xs">repo</code> scope
            so the analyzer can read your private repositories during analysis — we do not store
            repository source code.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Analysis results</h3>
          <p className="leading-relaxed text-muted-foreground">
            When you run an analysis, we store the repository URL, the commit SHA analyzed,
            and the computed metrics output (complexity scores, commit patterns, test proximity
            data, React component stats, AI usage signals). We do not store raw source code
            or commit diffs.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Documentation review results</h3>
          <p className="leading-relaxed text-muted-foreground">
            If you run a documentation review, the text content of markdown files under your
            repository&apos;s <code className="rounded bg-muted px-1 text-xs">documentation/</code> folder
            is sent to OpenAI&apos;s API for rubric assessment. We store the
            structured review output (checklist results and coach feedback) alongside your
            analysis. Document text is not stored permanently — only the assessment output is retained.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Course and team metadata</h3>
          <p className="leading-relaxed text-muted-foreground">
            If you access the tool through a course-specific URL (e.g.{" "}
            <code className="rounded bg-muted px-1 text-xs">/course/CSE115A-Summer26/analyze</code>),
            the course identifier and team name you enter are stored alongside your analysis
            result for research aggregation purposes.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">How we use your data</h2>
        <ul className="list-inside list-disc space-y-2 leading-relaxed text-muted-foreground">
          <li>To run the analysis and return results to you.</li>
          <li>To store your results so you can revisit them later.</li>
          <li>
            To conduct anonymized, aggregate research on software engineering education. Individual
            results are never published or shared in an identifiable form.
          </li>
          <li>To improve the accuracy and usefulness of the rubric-based documentation reviewer.</li>
        </ul>
        <p className="leading-relaxed text-muted-foreground">
          We do not sell your data, share it with advertisers, or use it for any purpose
          unrelated to the tool and associated research.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Third-party services</h2>
        <ul className="list-inside list-disc space-y-2 leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">GitHub</strong> — OAuth authentication and repository
            access via the GitHub API. Subject to{" "}
            <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
              className="text-primary underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer">
              GitHub&apos;s Privacy Statement
            </a>.
          </li>
          <li>
            <strong className="text-foreground">OpenAI</strong> — documentation review text is
            sent to the OpenAI API for rubric assessment. Subject to{" "}
            <a href="https://openai.com/policies/privacy-policy"
              className="text-primary underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer">
              OpenAI&apos;s Privacy Policy
            </a>.
          </li>
          <li>
            <strong className="text-foreground">Supabase</strong> — analysis results and user
            records are stored in a Supabase PostgreSQL database hosted in the United States.
          </li>
          <li>
            <strong className="text-foreground">Railway</strong> — the application is hosted on
            Railway infrastructure.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Data retention</h2>
        <p className="leading-relaxed text-muted-foreground">
          Analysis results are retained indefinitely to support longitudinal research. You may
          request deletion of your data at any time by contacting us at the address below.
          Deleting your GitHub OAuth session removes your authentication but does not
          automatically remove stored analysis results.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Your rights</h2>
        <p className="leading-relaxed text-muted-foreground">
          You may request access to, correction of, or deletion of any personal data we hold
          about you. To make a request, contact us at the address below. We will respond within
          30 days.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Changes to this statement</h2>
        <p className="leading-relaxed text-muted-foreground">
          We may update this privacy statement from time to time. Material changes will be
          noted by updating the effective date at the top of this page.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="leading-relaxed text-muted-foreground">
          Questions about this privacy statement or requests regarding your data can be directed
          to the project repository:{" "}
          <a href="https://github.com/scottyUX/ts-repo-metrics"
            className="text-primary underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer">
            github.com/scottyUX/ts-repo-metrics
          </a>.
        </p>
      </section>
    </article>
  );
}
