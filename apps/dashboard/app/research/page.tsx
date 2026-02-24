/**
 * Research page: Framework, questions, and methodology.
 * Study context, RQ operationalization, conceptual model, data sources, and status.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Research | Repo Metrics",
  description:
    "Research framework: study context, RQ operationalization, conceptual model, data sources, and analytical strategy",
};

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <h1 className="text-2xl font-bold">Research Framework</h1>
        <p className="mt-1 text-muted-foreground">
          Study context, research questions, conceptual model, and analytical strategy.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Research Context</h2>
        <Card>
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p className="mb-3">
              The rapid integration of generative AI tools into software development raises
              foundational questions about how engineering behavior changes in educational
              environments.
            </p>
            <p className="mb-3">
              This system supports a longitudinal study examining how AI availability corresponds
              with observable repository-level software engineering behaviors.
            </p>
            <p className="mb-3">
              The unit of analysis is the <strong>team repository</strong>.
            </p>
            <p>
              Each repository analysis produces a structured feature vector persisted in Supabase
              for statistical modeling.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Research Questions</h2>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">RQ1 — Behavioral Shift</CardTitle>
            <CardDescription>Observable workflow behaviors</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="mb-3">
              How does access to generative AI tools correspond with observable software
              engineering behaviors in student team projects?
            </p>
            <p className="mb-2 font-medium">Operationalization:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Commits per week</li>
              <li>Burst ratio</li>
              <li>Active commit days</li>
              <li>Median inter-commit interval</li>
              <li>Commit message informativeness</li>
            </ul>
            <p className="mt-3">
              When full git history is unavailable, API-derived workflow metrics are used.
              Ingestion mode is recorded to distinguish: <code className="rounded bg-muted px-1 py-0.5">local</code>{" "}
              (full git history) and <code className="rounded bg-muted px-1 py-0.5">api</code>{" "}
              (GitHub API proxy metrics).
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">RQ2 — Verification &amp; Engagement</CardTitle>
            <CardDescription>Verification effort and cognitive engagement</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="mb-3">
              Within AI-using teams, how do verification efforts and cognitive engagement
              patterns relate to repository indicators of quality and stability?
            </p>
            <p className="mb-2 font-medium">Repository-based verification signals:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Test density</li>
              <li>Error-handling anti-patterns</li>
              <li>Long method frequency</li>
              <li>Smell counts</li>
              <li>Structural risk exposure</li>
            </ul>
            <p className="mt-3">
              These are correlated with survey-based engagement measures.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">RQ3 — Project Quality Outcomes</CardTitle>
            <CardDescription>Structural complexity and maintainability</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="mb-3">
              Do projects developed with AI access exhibit differences in structural
              complexity, maintainability, and code quality?
            </p>
            <p className="mb-2 font-medium">Operationalization:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Mean and 90th percentile cyclomatic complexity</li>
              <li>Long function count</li>
              <li>Duplication percentage</li>
              <li>Maintainability index</li>
              <li>Structural risk index</li>
            </ul>
            <p className="mt-3">
              Upper-percentile metrics are emphasized to capture tail risk.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Conceptual Model</h2>
        <Card>
          <CardContent className="pt-6 text-sm">
            <div className="flex flex-col items-center gap-2 font-medium sm:flex-row sm:justify-center sm:gap-4">
              <span className="rounded-md border bg-muted/50 px-4 py-2 text-center">
                Behavioral Predictors (RQ1)
              </span>
              <span className="text-muted-foreground">↓</span>
              <span className="rounded-md border bg-muted/50 px-4 py-2 text-center">
                Verification Moderators (RQ2)
              </span>
              <span className="text-muted-foreground">↓</span>
              <span className="rounded-md border bg-muted/50 px-4 py-2 text-center">
                Structural Outcomes (RQ3)
              </span>
            </div>
            <p className="mt-4 text-muted-foreground">
              This framework enables modeling whether AI-associated workflow changes correspond
              with measurable shifts in structural quality.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Data Sources</h2>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <p className="mb-3">The study integrates:</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>Repository Mining (this system)</li>
              <li>Post-project student surveys</li>
              <li>Course milestone structure</li>
              <li>Cohort comparison (pre-AI vs AI-era)</li>
            </ol>
            <p className="mt-4">Each analysis result is persisted in Supabase and includes:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Commit SHA</li>
              <li>Ingestion mode</li>
              <li>Timestamp</li>
              <li>Engine version</li>
              <li>Full feature vector</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Ingestion Modes &amp; Research Implications</h2>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Local Mode</CardTitle>
            <CardDescription>Full git clone with .git history</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="mb-2">Provides:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Diff-level metrics</li>
              <li>Commit churn</li>
              <li>Test-touch commit ratio</li>
            </ul>
            <p className="mt-3">Used for high-fidelity research dataset generation.</p>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">API Mode</CardTitle>
            <CardDescription>Zipball + GitHub API</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="mb-2">Provides:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Commit cadence</li>
              <li>Burstiness</li>
              <li>Activity density</li>
            </ul>
            <p className="mt-3">
              Does not include diff-level churn. This mode ensures serverless compatibility
              while preserving RQ1 signals.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Analytical Strategy</h2>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <p className="mb-3">Planned analyses include:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Between-cohort comparison (pre-AI vs AI-era)</li>
              <li>Within-cohort regression modeling</li>
              <li>Moderation analysis (Verification × Risk)</li>
              <li>Distributional tail-risk analysis (p90 metrics)</li>
              <li>Feature export for statistical modeling</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Contributions</h2>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <p className="mb-3">This work aims to:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Identify measurable behavioral shifts in AI-assisted development</li>
              <li>Clarify relationships between verification effort and structural risk</li>
              <li>Provide a reproducible repository-based research instrument</li>
              <li>Inform software engineering curriculum design in AI-integrated contexts</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Current Status</h2>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <ul className="list-inside list-disc space-y-1">
              <li>Engine refactor complete</li>
              <li>Supabase persistence implemented</li>
              <li>GitHub API fallback for workflow metrics implemented</li>
              <li>Dashboard aligned to RQ1–RQ3 constructs</li>
              <li>Ingestion modes recorded for reproducibility</li>
            </ul>
            <p className="mt-4">
              The system now functions as a durable research infrastructure rather than a
              transient analysis tool.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
