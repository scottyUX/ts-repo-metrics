/**
 * Research page: Methods section in formal academic style.
 * Study design, measurement framework, variable construction,
 * statistical modeling, and reproducibility.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MathBlock } from "@/components/research/MathBlock";

export const metadata = {
  title: "Research | Repo Metrics",
  description:
    "Methods: study context, measurement framework, statistical modeling, reproducibility",
};

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <h1 className="text-2xl font-bold">2 Methods</h1>
        <p className="mt-1 text-muted-foreground">
          Study design, repository-based measurement, variable construction,
          and statistical modeling strategy.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-semibold">2.1 Study Context and Participants</h2>
        <Card>
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p className="mb-3">
              CSE 115 is an upper-division undergraduate software engineering course in which
              students work in teams of approximately five to complete a semester-long project
              following iterative milestones (planning, design, implementation, testing,
              deployment). Across offerings, course structure, milestone sequencing, grading
              rubrics, and repository requirements have remained consistent.
            </p>
            <p className="mb-3">We analyze two balanced cohorts:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong>Pre-AI cohort (2015–2020):</strong> 30 teams (~150 students)
              </li>
              <li>
                <strong>AI-era cohort (2025):</strong> 30 teams (~150 students) with access to
                generative AI tools
              </li>
            </ul>
            <p className="mt-3">
              AI usage in the 2025 offering was permitted but not required. Students completed
              a post-project survey capturing AI usage intensity, verification behaviors, cognitive
              engagement, and perceived ownership. Survey responses were anonymized and aggregated
              at the team level.
            </p>
            <p className="mt-3">
              The unit of analysis for repository-based modeling is the <strong>team repository</strong>.
              Each repository corresponds to a single observational unit.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">2.2 Study Design</h2>
        <Card>
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p className="mb-3">
              We employ a quasi-experimental matched cohort design combined with within-cohort
              behavioral modeling.
            </p>
            <p className="mb-3">The study consists of two complementary analyses:</p>
            <ol className="list-inside list-decimal space-y-2">
              <li>
                <strong>Between-cohort comparison (Pre-AI vs AI-era)</strong> — Examines whether
                observable repository indicators differ across cohorts.
              </li>
              <li>
                <strong>Within-cohort modeling (AI-era only)</strong> — Examines how variation in
                AI usage intensity and engagement relates to repository-based verification and
                quality outcomes.
              </li>
            </ol>
            <p className="mt-3">
              The design does not attempt to randomly assign AI exposure. Instead, it leverages
              consistent course structure across offerings to approximate matched conditions
              while recognizing potential temporal confounds.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">2.3 Repository-Based Measurement Framework</h2>
        <Card>
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p className="mb-3">Repository-derived measures are organized around five constructs:</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>Commit and Workflow Practices</li>
              <li>Verification Discipline</li>
              <li>Project Quality</li>
              <li>Collaboration and Social Coding</li>
              <li>AI Interaction Signals</li>
            </ol>
            <p className="mt-3">
              Metrics are extracted at a fixed commit snapshot using a deterministic analysis
              engine. For distribution-sensitive measures (e.g., complexity), both mean and
              upper-percentile statistics (e.g., 90th percentile) are computed to capture tail risk.
            </p>
            <p className="mt-3">
              All continuous variables are standardized prior to modeling unless otherwise specified.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">2.4 Variable Construction</h2>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">2.4.1 Behavioral Predictors (RQ1)</CardTitle>
            <CardDescription>Indicators derived from Git history</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-inside list-disc space-y-1">
              <li>Commits per week</li>
              <li>Median commit size</li>
              <li>Large commit rate (≥ 500 LOC)</li>
              <li>Commit message informativeness</li>
              <li>Churn concentration indicators</li>
            </ul>
            <p className="mt-3">
              These variables operationalize observable workflow structure and serve as predictors
              in modeling structural outcomes.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">2.4.2 Verification Moderators (RQ2)</CardTitle>
            <CardDescription>Verification Discipline operationalization</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-inside list-disc space-y-1">
              <li>Test density</li>
              <li>Test-touch commit rate</li>
              <li>Test lag</li>
              <li>Refactor commit rate</li>
              <li>Error-handling anti-pattern counts</li>
            </ul>
            <p className="mt-3">
              These variables function as potential moderators in interaction models examining
              whether verification effort mitigates structural risk.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2.4.3 Quality Outcomes (RQ3)</CardTitle>
            <CardDescription>Structural and maintainability outcomes</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-inside list-disc space-y-1">
              <li>Mean cyclomatic complexity</li>
              <li>90th percentile cyclomatic complexity</li>
              <li>Long method count (≥ 50 LOC)</li>
              <li>Duplication rate</li>
              <li>Maintainability index</li>
              <li>Code smell counts</li>
              <li>Module size distribution</li>
            </ul>
            <p className="mt-3">
              Upper-percentile metrics are emphasized to capture high-risk concentration rather
              than relying solely on averages.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">2.5 Statistical Modeling Strategy</h2>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">2.5.1 Between-Cohort Comparisons</CardTitle>
            <CardDescription>Evaluating RQ3</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              To evaluate RQ3, we compare pre-AI and AI-era cohorts using:
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>Independent-samples <em>t</em>-tests for normally distributed variables</li>
              <li>Mann–Whitney <em>U</em> tests for non-normal distributions</li>
              <li>Effect sizes (Cohen&apos;s <em>d</em> or rank-biserial correlation)</li>
            </ul>
            <p>Multiple comparison correction (Benjamini–Hochberg) is applied where appropriate.</p>
            <p>Primary outcome variables include: 90th percentile complexity, long method count,
              duplication rate, maintainability index.</p>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">2.5.2 Regression Modeling of Behavioral Predictors</CardTitle>
            <CardDescription>Evaluating RQ1</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              To evaluate RQ1, we estimate linear regression models of the form:
            </p>
            <MathBlock>
              {`Y_i = \\beta_0 + \\beta_1 \\text{AI}_i + \\beta_2 \\text{Behavior}_i + \\epsilon_i`}
            </MathBlock>
            <p>Where:</p>
            <ul className="list-inside list-disc space-y-1">
              <li><em>Y</em><sub>i</sub> is a quality outcome metric for team <em>i</em></li>
              <li>AI<sub>i</sub> is a cohort indicator (0 = pre-AI, 1 = AI-era)</li>
              <li>Behavior<sub>i</sub> represents workflow metrics (e.g., large commit rate)</li>
              <li>ε<sub>i</sub> is the error term</li>
            </ul>
            <p>
              Robust standard errors are used to account for heteroskedasticity.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">2.5.3 Moderation Analysis (Verification × Risk)</CardTitle>
            <CardDescription>Evaluating RQ2</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              To evaluate RQ2, we test whether Verification Discipline moderates the relationship
              between AI usage and structural risk:
            </p>
            <MathBlock>
              {`Y_i = \\beta_0 + \\beta_1 \\text{AI}_i + \\beta_2 \\text{Verification}_i + \\beta_3 (\\text{AI}_i \\times \\text{Verification}_i) + \\epsilon_i`}
            </MathBlock>
            <p>Where:</p>
            <ul className="list-inside list-disc space-y-1">
              <li><em>Y</em><sub>i</sub> is a structural outcome (e.g., 90th percentile complexity)</li>
              <li>Verification<sub>i</sub> is a composite or standardized verification index</li>
              <li>The interaction term tests moderation</li>
            </ul>
            <p>
              A significant interaction term (β<sub>3</sub>) indicates that verification effort
              influences how AI exposure relates to structural outcomes.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">2.5.4 Within-Cohort Modeling (AI-Era Only)</CardTitle>
            <CardDescription>AI-era specific analysis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Within the AI-era cohort, we estimate:</p>
            <MathBlock>
              {`Y_i = \\beta_0 + \\beta_1 \\text{AIUsageIntensity}_i + \\beta_2 \\text{Verification}_i + \\beta_3 \\text{Engagement}_i + \\epsilon_i`}
            </MathBlock>
            <p>Where:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>AIUsageIntensity is derived from survey measures</li>
              <li>Engagement is a composite cognitive engagement score</li>
              <li>Verification is repository-derived</li>
            </ul>
            <p>
              This model evaluates whether higher AI usage predicts structural differences, and
              whether engagement and verification mitigate potential risk.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">2.6 Distributional and Tail-Risk Analysis</h2>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <p className="mb-3">
              Because structural risk often concentrates in upper-percentile values, we:
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>Report 90th percentile metrics alongside means</li>
              <li>Compute concentration ratios (e.g., proportion of high-complexity functions in top 10% of files)</li>
              <li>Compare distribution shapes using kernel density estimates</li>
            </ul>
            <p className="mt-3">
              This approach avoids masking extreme risk patterns through averaging.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">2.7 Sensitivity and Robustness Checks</h2>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <p className="mb-3">We perform:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Threshold sensitivity analysis (e.g., complexity ≥ 8 vs ≥ 10)</li>
              <li>Winsorization of extreme values</li>
              <li>Re-estimation excluding outlier repositories</li>
              <li>Alternative operationalizations of large commits</li>
            </ul>
            <p className="mt-3">
              These analyses ensure conclusions are not artifacts of arbitrary thresholds.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">2.8 Reproducibility and Determinism</h2>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <p className="mb-3">All repository metrics are derived from fixed commit snapshots. Each analysis records:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Repository URL</li>
              <li>Commit SHA</li>
              <li>Analysis timestamp</li>
              <li>Analyzer version</li>
            </ul>
            <p className="mt-3">
              Given a repository and commit SHA, metric extraction is deterministic. This makes
              the system research-safe and auditable.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
