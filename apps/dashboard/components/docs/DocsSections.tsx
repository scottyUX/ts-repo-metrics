import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MermaidDiagram } from "@/components/docs/MermaidDiagram";
import {
  ANALYZE_ARCHITECTURE_DIAGRAM,
  AUTH_AND_AI_DIAGRAM,
  ENGINE_PIPELINE_DIAGRAM,
  GIT_METRICS_DIAGRAM,
} from "@/components/docs/constants";
import { paperAffiliation, paperAuthors } from "@/lib/paperAuthors";
import { titleForSlug } from "@/components/docs/docsNav";

const GITHUB_REPO = "https://github.com/scottyUX/ts-repo-metrics";

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-prose mx-auto max-w-3xl space-y-4 text-sm leading-relaxed">
      {children}
    </div>
  );
}

export function DocsSectionBody({ slug }: { slug: string }) {
  const sectionTitle = titleForSlug(slug) ?? "Documentation";

  return (
    <article className="mx-auto max-w-3xl pb-16">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-bold tracking-tight">{sectionTitle}</h1>
        <p className="mt-2 text-muted-foreground">
          Contributor-focused documentation for the Repo Metrics monorepo (
          <Link
            href={GITHUB_REPO}
            className="text-primary underline-offset-4 hover:underline"
          >
            GitHub
          </Link>
          ).
        </p>
      </header>

      {slug === "introduction" ? <IntroductionSection /> : null}
      {slug === "authors" ? <AuthorsSection /> : null}
      {slug === "getting-started" ? <GettingStartedSection /> : null}
      {slug === "run-locally" ? <RunLocallySection /> : null}
      {slug === "system-map" ? <SystemMapSection /> : null}
      {slug === "contributing" ? <ContributingSection /> : null}
      {slug === "metrics" ? <MetricsCalculationSection /> : null}
      {slug === "architecture" ? <ArchitectureSection /> : null}
      {slug === "git-metrics" ? <GitMetricsSection /> : null}
      {slug === "metrics-categories" ? <MetricsCategoriesSection /> : null}
      {slug === "documentation-review" ? <DocumentationReviewSection /> : null}
      {slug === "reproducibility" ? <ReproducibilitySection /> : null}
      {slug === "limitations" ? <LimitationsSection /> : null}
      {slug === "roadmap" ? <RoadmapSection /> : null}
    </article>
  );
}

function IntroductionSection() {
  return (
    <Prose>
      <p>
        This project combines a TypeScript{" "}
        <strong>analysis engine</strong> (<code className="rounded bg-muted px-1">packages/engine</code>),
        a <strong>Next.js dashboard</strong> (<code className="rounded bg-muted px-1">apps/dashboard</code>),
        and a thin <strong>CLI</strong> used for local and batch analysis.
      </p>
      <p className="text-muted-foreground">
        Use these docs to run the stack locally, understand where metrics come from,
        and contribute safely (tests, schema updates, PR workflow).
      </p>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">What this codebase produces</CardTitle>
          <CardDescription>
            From a public GitHub URL or local path to a repository
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Workflow behavior metrics (commit cadence, bursts, message signals)</li>
            <li>Verification proxies (tests, smells, structural risk)</li>
            <li>Structural quality (complexity, duplication, maintainability)</li>
            <li>Optional Phase 3 TSX pathology summaries and AI smells tab wiring (silent-failure density, redundancy)</li>
            <li>Optional repo coach and tab insights on results when <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> is set</li>
            <li>
              Optional{" "}
              <Link href="/docs/documentation-review" className="text-primary underline-offset-4 hover:underline">
                documentation review
              </Link>{" "}
              — filename-based classification + rubric review of student planning docs (
              <code className="rounded bg-muted px-1">DOC_REVIEW_ENABLED=true</code>)
            </li>
            <li>A reproducible JSON report and optional dashboard dataset export</li>
          </ul>
        </CardContent>
      </Card>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Course-specific URLs</CardTitle>
          <CardDescription>Instructor-provided entry points for CSE 115 sections</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm space-y-2">
          <p>
            Instructors can share a pre-configured URL such as{" "}
            <code className="rounded bg-muted px-1">/course/CSE115A-Summer26/analyze</code>. Students
            arrive at a landing page personalized with the course name and term, then complete a
            three-step flow: consent → team name → repo selection. The{" "}
            <code className="rounded bg-muted px-1">course_id</code> and{" "}
            <code className="rounded bg-muted px-1">team_name</code> are persisted on the{" "}
            <code className="rounded bg-muted px-1">analyses</code> row for research aggregation.
            An allow-list in <code className="rounded bg-muted px-1">/api/analyze</code> rejects
            unknown course slugs.
          </p>
          <p>
            Documentation templates for students are available at{" "}
            <Link href="/resources" className="text-primary underline-offset-4 hover:underline">
              /resources
            </Link>
            .
          </p>
        </CardContent>
      </Card>
      <p className="text-muted-foreground">
        For the empirical study text and figures, see{" "}
        <Link href="/research" className="text-primary underline-offset-4 hover:underline">
          Research
        </Link>
        . Paper credits:{" "}
        <Link href="/docs/authors" className="text-primary underline-offset-4 hover:underline">
          Authors
        </Link>
        .
      </p>
    </Prose>
  );
}

function AuthorsSection() {
  return (
    <Prose>
      <p className="text-muted-foreground">
        Contributing authors on the empirical study mirrored on the{" "}
        <Link href="/research" className="text-primary underline-offset-4 hover:underline">
          Research
        </Link>{" "}
        page.
      </p>
      <ul className="space-y-2 text-muted-foreground">
        {paperAuthors.map(({ name, email }) => (
          <li key={email}>
            <span className="font-medium text-foreground">{name}</span>
            {" — "}
            <a href={`mailto:${email}`} className="text-primary underline-offset-4 hover:underline">
              {email}
            </a>
          </li>
        ))}
      </ul>
      <p>{paperAffiliation}</p>
    </Prose>
  );
}

function GettingStartedSection() {
  return (
    <Prose>
      <p>
        <strong>Prerequisites:</strong> Node.js ≥ 18 and npm.
      </p>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Clone and install</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs sm:text-sm">
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 whitespace-pre">
            {`git clone ${GITHUB_REPO}.git
cd ts-repo-metrics
npm install
cd apps/dashboard && npm install
cd ../../packages/engine && npm run build`}
          </pre>
        </CardContent>
      </Card>
      <p className="text-muted-foreground">
        The dashboard imports{" "}
        <code className="rounded bg-muted px-1">@repo-metrics/engine</code>, which publishes{" "}
        <code className="rounded bg-muted px-1">dist/</code> only — run{" "}
        <code className="rounded bg-muted px-1">cd packages/engine && npm run build</code> before your first{" "}
        <code className="rounded bg-muted px-1">npm run dashboard</code> (or run{" "}
        <code className="rounded bg-muted px-1">npm run dev</code>
        {" "}
        inside <code className="rounded bg-muted px-1">packages/engine</code>
        {" "}
        alongside Next for auto-rebuilds). Production builds already run{" "}
        <code className="rounded bg-muted px-1">build:engine</code> before{" "}
        <code className="rounded bg-muted px-1">next build</code>.
      </p>
    </Prose>
  );
}

function RunLocallySection() {
  return (
    <Prose>
      <p className="text-muted-foreground">
        Build the engine once before analyzing from the dashboard:{" "}
        <code className="rounded bg-muted px-1">cd packages/engine && npm run build</code>.
      </p>
      <h2 className="text-lg font-semibold text-foreground">CLI (repo root)</h2>
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs sm:text-sm whitespace-pre">
        {`npm run dev -- analyze /absolute/path/to/repo
npm run dev -- analyze https://github.com/org/repo [--no-cache]
npm run dev -- batch /path/to/parent --output ./reports --csv`}
      </pre>
      <h2 className="text-lg font-semibold text-foreground">Dashboard dev server</h2>
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs sm:text-sm whitespace-pre">{`npm run dashboard`}</pre>
      <p className="text-muted-foreground">
        Starts Next.js in <code className="rounded bg-muted px-1">apps/dashboard</code> (typically{" "}
        <code className="rounded bg-muted px-1">http://localhost:3000</code>
        ).
      </p>
      <Card className="not-prose overflow-x-auto">
        <CardHeader>
          <CardTitle className="text-base">Environment tiers</CardTitle>
          <CardDescription>Copy from canonical template apps/dashboard/.env.example</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{`cp apps/dashboard/.env.example apps/dashboard/.env.local`}</pre>
          <p className="text-xs sm:text-sm">
            Shared team secrets stay out of git (password manager). See{" "}
            <Link href={`${GITHUB_REPO}/blob/main/apps/dashboard/VERCEL_DEPLOY.md`} className="text-primary underline-offset-4 hover:underline">
              VERCEL_DEPLOY.md
            </Link>{" "}
            for production parity and Supabase auth setup.
          </p>
          <table className="w-full min-w-[560px] border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b text-left font-medium text-foreground">
                <th className="py-2 pr-3 align-top">Tier</th>
                <th className="py-2 pr-3 align-top">Variables</th>
                <th className="py-2 align-top">Behavior</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b align-top">
                <td className="py-2 pr-3 font-medium text-foreground">Minimal</td>
                <td className="py-2 pr-3 font-mono text-[11px] sm:text-xs">
                  NEXT_PUBLIC_SUPABASE_URL<br />
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </td>
                <td className="py-2">
                  GitHub sign-in is required before <code className="rounded bg-muted px-1">POST /api/analyze</code>{" "}
                  runs. Omitting the{" "}
                  <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> in development keeps
                  results in-memory only (<code className="rounded bg-muted px-1">isDevReportMemoryFallback</code>
                  ).
                </td>
              </tr>
              <tr className="border-b align-top">
                <td className="py-2 pr-3 font-medium text-foreground">Coach / insights AI</td>
                <td className="py-2 pr-3 font-mono text-[11px] sm:text-xs">OPENAI_API_KEY</td>
                <td className="py-2">
                  Enables streamed coach chat (<code className="rounded bg-muted px-1">/api/chat</code>), coach snippets (
                  <code className="rounded bg-muted px-1">/api/coach-says</code>), and tab insight summaries (
                  <code className="rounded bg-muted px-1">/api/tab-insight</code>
                  ).
                </td>
              </tr>
              <tr className="border-b align-top">
                <td className="py-2 pr-3 font-medium text-foreground">Documentation review</td>
                <td className="py-2 pr-3 font-mono text-[11px] sm:text-xs">
                  OPENAI_API_KEY<br />
                  DOC_REVIEW_ENABLED=true
                </td>
                <td className="py-2">
                  Enables <code className="rounded bg-muted px-1">POST /api/doc-review</code> and the Results{" "}
                  <strong>Documentation</strong> tab. Persists output to{" "}
                  <code className="rounded bg-muted px-1">analyses.doc_review_json</code> when Supabase storage is
                  configured. See{" "}
                  <Link href="/docs/documentation-review" className="text-primary underline-offset-4 hover:underline">
                    Documentation review
                  </Link>
                  .
                </td>
              </tr>
              <tr className="border-b align-top">
                <td className="py-2 pr-3 font-medium text-foreground">Throughput</td>
                <td className="py-2 pr-3 font-mono text-[11px] sm:text-xs">GITHUB_TOKEN (optional)</td>
                <td className="py-2">
                  Raises GitHub API limits for clone and REST metadata when no user PAT is attached.
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3 font-medium text-foreground">Sign-in / durable storage</td>
                <td className="py-2 pr-3 font-mono text-[11px] leading-snug sm:text-xs">
                  NEXT_PUBLIC_SUPABASE_URL<br />
                  NEXT_PUBLIC_SUPABASE_ANON_KEY<br />
                  SUPABASE_SERVICE_ROLE_KEY<br />
                  GITHUB_OAUTH_ENCRYPTION_KEY
                </td>
                <td className="py-2">
                  Cookie sessions via <code className="rounded bg-muted px-1">@supabase/ssr</code> middleware,{" "}
                  <code className="rounded bg-muted px-1">analyses</code> persistence, encrypted PAT storage (
                  <code className="rounded bg-muted px-1">user_github_tokens</code>) for private repos. Optional{" "}
                  <code className="rounded bg-muted px-1">APP_ORIGIN</code> for OAuth behind proxies (
                  documented in RAILWAY_DEPLOY).
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Prose>
  );
}

function SystemMapSection() {
  return (
    <Prose>
      <p className="text-muted-foreground">
        The analysis core lives in one package; entrypoints import it in-process (no analyzer subprocess).
      </p>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Packages & apps</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto text-sm text-muted-foreground">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium text-foreground">Location</th>
                <th className="py-2 font-medium text-foreground">Role</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-4 align-top font-mono text-xs">packages/engine</td>
                <td className="py-2">
                  Pipeline, AST parsing, extractors, duplication, git/API workflow metrics,{" "}
                  <code className="rounded bg-muted px-1">RepoReport</code> types.
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 align-top font-mono text-xs">apps/dashboard</td>
                <td className="py-2">
                  Next.js UI; <code className="rounded bg-muted px-1">app/api/analyze</code> imports the engine;
                  Supabase persistence; optional OpenAI coach route.
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 align-top font-mono text-xs">src/cli.ts</td>
                <td className="py-2">Thin CLI routing URL vs path vs batch mode.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top font-mono text-xs">src/batch</td>
                <td className="py-2">Batch runner over sibling repos.</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Runtime integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-foreground">Supabase</strong> — auth session cookies,
              <code className="mx-1 rounded bg-muted px-1">analyses</code> table rows.
            </li>
            <li>
              <strong className="text-foreground">GitHub</strong> — clone / REST enrichment when tokens are present.
            </li>
            <li>
              <strong className="text-foreground">OpenAI</strong> (optional) — streamed coach on results (
              <code className="rounded bg-muted px-1">/api/chat</code>), short coach payloads (
              <code className="rounded bg-muted px-1">/api/coach-says</code>
              ), structured tab summaries (<code className="rounded bg-muted px-1">/api/tab-insight</code>
              ).
            </li>
          </ul>
        </CardContent>
      </Card>
      <p>
        See also{" "}
        <Link
          href={`${GITHUB_REPO}/blob/main/docs/ARCHITECTURE.md`}
          className="text-primary underline-offset-4 hover:underline"
        >
          docs/ARCHITECTURE.md
        </Link>{" "}
        in the repository for diagrams and module responsibilities.
      </p>
    </Prose>
  );
}

function ContributingSection() {
  return (
    <Prose>
      <p className="text-muted-foreground">
        Follow the repo contributing guide for branches, tests, and schema updates.
      </p>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Quick checklist</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <ol className="list-inside list-decimal space-y-2">
            <li>
              Branch from <code className="rounded bg-muted px-1">main</code>.
            </li>
            <li>
              Extend <code className="rounded bg-muted px-1">RepoReport</code> in{" "}
              <code className="rounded bg-muted px-1">packages/engine/src/types/report.ts</code> when adding metrics.
            </li>
            <li>
              Wire extractors in{" "}
              <code className="rounded bg-muted px-1">pipeline/analyzeRepo.ts</code>; export from engine index if needed.
            </li>
            <li>
              Update <code className="rounded bg-muted px-1">docs/SCHEMA.md</code> and run{" "}
              <code className="rounded bg-muted px-1">npm test</code>.
            </li>
            <li>Refresh snapshots only when JSON output changes intentionally.</li>
          </ol>
        </CardContent>
      </Card>
      <p>
        Full guide:{" "}
        <Link
          href={`${GITHUB_REPO}/blob/main/CONTRIBUTING.md`}
          className="text-primary underline-offset-4 hover:underline"
        >
          CONTRIBUTING.md
        </Link>
        .
      </p>
    </Prose>
  );
}

function MetricsCalculationSection() {
  return (
    <Prose>
      <p className="text-muted-foreground">
        Canonical references in the repo:{" "}
        <Link
          href={`${GITHUB_REPO}/blob/main/docs/SCHEMA.md`}
          className="text-primary underline-offset-4 hover:underline"
        >
          docs/SCHEMA.md
        </Link>{" "}
        (JSON fields) and{" "}
        <Link
          href={`${GITHUB_REPO}/blob/main/docs/METRICS_CONCEPTS.md`}
          className="text-primary underline-offset-4 hover:underline"
        >
          docs/METRICS_CONCEPTS.md
        </Link>{" "}
        (interpretation, Phase 2 lexical/cognitive/GRAD-AI MI, Phase 3 pathology definitions, threshold citations).
      </p>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Pipeline order</CardTitle>
          <CardDescription>High-level analyzer flow</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <ol className="list-inside list-decimal space-y-1">
            <li>Profile repository (LOC, file counts)</li>
            <li>Discover source files (ignore lists)</li>
            <li>Parse with Tree-sitter (TS / TSX grammars)</li>
            <li>Extract per-function metrics, smells, distributions</li>
            <li>Collect duplication (jscpd), framework signals, git metrics</li>
            <li>Aggregate into typed <code className="rounded bg-muted px-1">RepoReport</code></li>
          </ol>
        </CardContent>
      </Card>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Engine internals (diagram)</CardTitle>
          <CardDescription>analyzeRepo merges collect, parsing, and extract phases</CardDescription>
        </CardHeader>
        <CardContent>
          <MermaidDiagram code={ENGINE_PIPELINE_DIAGRAM} className="my-4 text-sm" />
        </CardContent>
      </Card>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Implementation map</CardTitle>
          <CardDescription>Start here when debugging a metric</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto font-mono text-xs text-muted-foreground">
          <ul className="space-y-2">
            <li>
              <code className="text-foreground">packages/engine/src/pipeline/analyzeRepo.ts</code> — orchestrator
            </li>
            <li>
              <code className="text-foreground">packages/engine/src/extract/functionMetrics.ts</code> — per-function rollups (Halstead, cognitive, GRAD MI)
            </li>
            <li>
              <code className="text-foreground">packages/engine/src/extract/complexity.ts</code> — cyclomatic complexity
            </li>
            <li>
              <code className="text-foreground">packages/engine/src/collect/gitMetrics.ts</code> — local git history (PR runs use <code className="text-foreground">base...head</code>)
            </li>
            <li>
              <code className="text-foreground">packages/engine/src/extract/react/</code> — TSX/React heuristics
            </li>
            <li>
              <code className="text-foreground">packages/engine/src/extract/silentFailures.ts</code> — Phase 3 TSX silent-failure scan
            </li>
            <li>
              <code className="text-foreground">packages/engine/src/collect/weightedRedundancy.ts</code> — structural redundancy from jscpd JSON
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Dashboard derivation</CardTitle>
        </CardHeader>
        <CardContent className="font-mono text-xs text-muted-foreground space-y-2">
          <p>
            <code className="text-foreground">apps/dashboard/lib/featureVector.ts</code> — flat dataset vector & exports.
          </p>
          <p>
            <code className="text-foreground">apps/dashboard/lib/phase2Traffic.ts</code> — lexical/complexity traffic-light bands.
          </p>
          <p className="font-sans text-sm">
            UI glossary panels reference the same concepts documented in{" "}
            <code className="rounded bg-muted px-1">METRICS_CONCEPTS.md</code>.
          </p>
        </CardContent>
      </Card>
      <p className="text-muted-foreground">
        Git ingestion modes (<code className="rounded bg-muted px-1">local</code>,{" "}
        <code className="rounded bg-muted px-1">api</code>,{" "}
        <code className="rounded bg-muted px-1">none</code>) gate diff-level churn and several verification proxies — see{" "}
        <Link href="/docs/git-metrics" className="text-primary underline-offset-4 hover:underline">
          Git metrics & ingestion
        </Link>
        .
      </p>
    </Prose>
  );
}

function ArchitectureSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Analyze flow</CardTitle>
          <CardDescription>
            Middleware, <code className="rounded bg-muted px-1">POST /api/analyze</code>, engine, GitHub, Supabase
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <MermaidDiagram code={ANALYZE_ARCHITECTURE_DIAGRAM} className="my-4" />
          <section className="space-y-2 text-muted-foreground">
            <h3 className="font-semibold text-foreground">Analysis engine</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Tree-sitter parsing, function metrics, smells</li>
              <li>Duplication via jscpd</li>
              <li>Maintainability index and distributions</li>
              <li>Workflow metrics from local git (full history or PR <code className="rounded bg-muted px-1">base...head</code>)</li>
            </ul>
          </section>
          <section className="space-y-2 text-muted-foreground">
            <h3 className="font-semibold text-foreground">Git modes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">Mode</th>
                    <th className="py-2 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 font-mono text-xs">local</td>
                    <td className="py-2">Full clone retains .git history</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-mono text-xs">api</td>
                    <td className="py-2">Legacy REST proxies from the retired zipball path (not produced by current Analyze)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-mono text-xs">none</td>
                    <td className="py-2">Git unavailable — downstream metrics show as missing</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section className="space-y-2 text-muted-foreground">
            <h3 className="font-semibold text-foreground">Supabase</h3>
            <p>
              Rows in <code className="rounded bg-muted px-1">analyses</code> store{" "}
              <code className="rounded bg-muted px-1">report_json</code>, hashes, ingestion metadata for reproducibility.
            </p>
          </section>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>GitHub OAuth and AI routes</CardTitle>
          <CardDescription>Requires Supabase GitHub provider and optional OpenAI when using coach features</CardDescription>
        </CardHeader>
        <CardContent>
          <MermaidDiagram code={AUTH_AND_AI_DIAGRAM} className="my-4 text-sm" />
        </CardContent>
      </Card>
    </div>
  );
}

function GitMetricsSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Git metrics strategy</CardTitle>
          <CardDescription>Git clone is required</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm text-muted-foreground">
          <p>
            Analyze requires a <code className="rounded bg-muted px-1">git</code> binary (Railway or local). There is no zipball fallback. Pull-request analysis checks out the PR head and scores changed TypeScript files only; git metrics use <code className="rounded bg-muted px-1">base...head</code>.
          </p>
          <MermaidDiagram code={GIT_METRICS_DIAGRAM} className="my-4" />
          <section>
            <h3 className="mb-2 font-semibold text-foreground">PR-scoped git signals</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Commit size, bursts, and churn computed on commits in the PR range</li>
              <li>Contributor split still works when a PR has multiple authors</li>
            </ul>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricsCategoriesSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Commit habits tab</CardTitle>
          <CardDescription>Workflow-facing dashboard grouping</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Commits per week, bursts, activity concentration</li>
            <li>Commit message heuristics</li>
            <li>Ingestion mode surfaced for analysts</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Testing tab</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Test density & verification proxies</li>
            <li>Error-handling smells</li>
            <li>Refactor/test coupling metrics when git history is local</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Code quality tab</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Cyclomatic complexity aggregates</li>
            <li>Long functions, duplication, maintainability index</li>
            <li>Structural risk composites when configured</li>
            <li>Phase 3 / AI smells tab when the report includes pathology fields</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ReproducibilitySection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recorded metadata</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Repository URL & analyzed commit SHA</li>
            <li>Analyzer / engine version</li>
            <li>Ingestion mode & timestamps</li>
          </ul>
          <p className="mt-3">
            Given identical inputs + engine build, JSON output is deterministic — snapshot tests guard accidental drift.
            Git ingestion mode affects which fields are populated: metrics that depend on raw history or numstat deltas may be unavailable in{" "}
            <code className="rounded bg-muted px-1">api</code> or{" "}
            <code className="rounded bg-muted px-1">none</code> modes;
            record <code className="rounded bg-muted px-1">report.git.mode</code> alongside exports for cohort reproducibility.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Engine thresholds (defaults)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>High complexity:</strong> ≥ 10 cyclomatic
          </p>
          <p>
            <strong>Long method:</strong> ≥ 50 LOC
          </p>
          <p>
            <strong>Large commit:</strong> ≥ 500 LOC
          </p>
          <p>
            <strong>Deep nesting:</strong> ≥ 4 levels
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentationReviewSection() {
  return (
    <Prose>
      <p>
        The dashboard discovers student planning documents in a GitHub repository, classifies
        each file by filename, and reviews it against frozen course rubrics. Output is persisted
        on the same <code className="rounded bg-muted px-1">analyses</code> row as repo metrics
        (<code className="rounded bg-muted px-1">doc_review_json</code>) for research joins with{" "}
        <code className="rounded bg-muted px-1">course_id</code>,{" "}
        <code className="rounded bg-muted px-1">team_name</code>, and{" "}
        <code className="rounded bg-muted px-1">github_login</code>.
      </p>
      <Card className="not-prose">
        <CardHeader>
          <CardTitle className="text-base">Enable locally</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-muted-foreground">
          <ol className="list-inside list-decimal space-y-1 text-sm">
            <li>
              Apply{" "}
              <code className="rounded bg-muted px-1">
                supabase/migrations/20260522010000_analyses_doc_review.sql
              </code>
            </li>
            <li>
              Set <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> and{" "}
              <code className="rounded bg-muted px-1">DOC_REVIEW_ENABLED=true</code> in{" "}
              <code className="rounded bg-muted px-1">.env.local</code>
            </li>
            <li>Sign in with GitHub, run an analysis, open Results → Documentation</li>
          </ol>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold text-foreground">Discovery</h2>
      <p className="text-muted-foreground">
        Only the <code className="rounded bg-muted px-1">documentation/</code> folder at the
        repository root is searched. Files in subdirectories are included. Only{" "}
        <code className="rounded bg-muted px-1">.md</code> files are supported.
      </p>

      <h2 className="text-lg font-semibold text-foreground">Classification</h2>
      <p className="text-muted-foreground">
        Classification is a pure filename match — no AI classifier. The filename (case-insensitive)
        determines the document type:
      </p>
      <Card className="not-prose">
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full border-collapse text-xs font-mono text-muted-foreground">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1.5 pr-4 font-semibold text-foreground">Filename</th>
                <th className="py-1.5 font-semibold text-foreground">Doc type</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["sprint-{n}-plan.md", "sprint_plan (sprintNumber = n)"],
                ["sprint-{n}-report.md", "sprint_report (sprintNumber = n)"],
                ["release-plan.md", "release_plan"],
                ["test-plan.md", "test_plan"],
                ["definition-of-done.md", "definition_of_done"],
                ["code-standards.md", "code_standards"],
                ["anything else", "unknown (not reviewed)"],
              ].map(([file, type]) => (
                <tr key={file} className="border-b last:border-0">
                  <td className="py-1.5 pr-4">{file}</td>
                  <td className="py-1.5 text-muted-foreground">{type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-muted-foreground">
        Students should name their files exactly. Download example templates from{" "}
        <Link href="/resources" className="text-primary underline-offset-4 hover:underline">
          /resources
        </Link>
        .
      </p>

      <h2 className="text-lg font-semibold text-foreground">Review pipeline</h2>
      <ul className="list-inside list-disc space-y-1 text-muted-foreground">
        <li>
          <strong>Reviewer</strong> (<code className="rounded bg-muted px-1">gpt-4o</code>) —
          checklist + coach paragraph for structured docs, holistic strengths/improvements for DoD
          and code standards
        </li>
        <li>
          <strong>Consistency</strong> — deterministic warnings: missing required docs, duplicate
          doc keys, language coverage vs{" "}
          <code className="rounded bg-muted px-1">report.github.languages</code>
        </li>
      </ul>

      <h2 className="text-lg font-semibold text-foreground">Rubrics</h2>
      <Card className="not-prose">
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full border-collapse text-sm text-muted-foreground">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1.5 pr-4 font-medium text-foreground">Document type</th>
                <th className="py-1.5 pr-4 font-medium text-foreground">Mode</th>
                <th className="py-1.5 font-medium text-foreground">Keys / notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Sprint Plan", "checklist", "17 keys — includes capacity buffer, acceptance criteria, user story quality, no epics, specific tasks. Also emits userStoryCount (numeric)."],
                ["Sprint Report", "checklist", "14 keys — includes burnup_chart_present and burnup_data_present as independent signals."],
                ["Release Plan", "checklist", "10 keys"],
                ["Test Plan", "checklist", "9 keys — Given/When/Then scenarios, unit test results"],
                ["Definition of Done", "holistic", "Strengths + improvements across 5 dimensions (coverage, specificity, simplicity, applicability, key categories)."],
                ["Code Standards", "holistic", "Strengths + improvements — style guide citation, naming, formatting, best practices, language-specificity."],
              ].map(([doc, mode, notes]) => (
                <tr key={doc} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-4 font-medium text-foreground">{doc}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{mode}</td>
                  <td className="py-2">{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold text-foreground">API</h2>
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs whitespace-pre">{`POST /api/doc-review
  { "resultId": "<analysis id>", "url?": "...", "report?": { ... } }

GET /api/results/[id]/doc-review`}</pre>
      <p className="text-muted-foreground">
        Full reference:{" "}
        <Link
          href={`${GITHUB_REPO}/blob/main/docs/DOC_REVIEW_AGENT.md`}
          className="text-primary underline-offset-4 hover:underline"
        >
          docs/DOC_REVIEW_AGENT.md
        </Link>
        . Server logs must never include raw document text.
      </p>
    </Prose>
  );
}

function LimitationsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Known limitations</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <ul className="list-inside list-disc space-y-1">
          <li>API git mode lacks diff-level churn metrics.</li>
          <li>Large repos may hit serverless CPU/memory ceilings.</li>
          <li>Duplication depends on jscpd runtime stability.</li>
          <li>Git-heavy proxies require tokens for credible GitHub throughput.</li>
          <li>Phase 3 and AI smells panels encode static heuristics (try/catch shape, JSX component size thresholds, jscpd-based redundancy) — not behavioral runtime observations.</li>
          <li>
            Documentation review supports <code className="rounded bg-muted px-1">.md</code> only
            (PDF dropped). Classification is filename-exact — files with non-standard names are
            classified as <code className="rounded bg-muted px-1">unknown</code> and not reviewed.
            Cross-doc story-ID traceability and test-plan vs engine cross-checks are not implemented.
          </li>
          <li>
            Course allow-list is hard-coded in{" "}
            <code className="rounded bg-muted px-1">/api/analyze</code> — adding a new course
            section requires a code change and redeploy.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function RoadmapSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recently shipped</CardTitle>
          <CardDescription>Changes landed in May 2026</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>
              Doc review classifier replaced with pure filename matching — faster, deterministic,
              no gpt-4o-mini cost
            </li>
            <li>
              Sprint Plan rubric expanded from 12 → 17 keys (capacity buffer, acceptance criteria,
              user story quality, no epics, specific tasks)
            </li>
            <li>Sprint Report rubric: added <code className="rounded bg-muted px-1">burnup_data_present</code> (13 → 14 keys)</li>
            <li>
              <code className="rounded bg-muted px-1">userStoryCount</code> numeric field on Sprint
              Plan reviews
            </li>
            <li>Doc review UI: checklist always expanded, review cards above consistency warnings</li>
            <li>Course-specific landing pages with term/section personalization (CSE 115A/B/C)</li>
            <li>Course allow-list enforcement in <code className="rounded bg-muted px-1">/api/analyze</code></li>
            <li>
              Resources page (<Link href="/resources" className="text-primary underline-offset-4 hover:underline">/resources</Link>)
              with downloadable example templates for all 6 doc types
            </li>
            <li>Legal pages: Privacy, Terms of Use, License, Report an Issue</li>
            <li>Site footer with research disclaimer on every page</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Roadmap ideas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Doc review: story-ID traceability across release/sprint/test plans</li>
            <li>Doc review: unit-test claims vs engine verification cross-check</li>
            <li>Course allow-list driven from database instead of hard-coded set</li>
            <li>Background workers for oversized repositories</li>
            <li>Expanded CSV cohort exports</li>
            <li>Collaboration metrics via PR/issue APIs</li>
            <li>Tighter coupling between survey constructs and repo-derived panels</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
