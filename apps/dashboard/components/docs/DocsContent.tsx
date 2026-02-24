"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MermaidDiagram } from "./MermaidDiagram";

const DOC_TABS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "System Architecture" },
  { id: "git-metrics", label: "Git Metrics Strategy" },
  { id: "metrics", label: "Metrics Categories" },
  { id: "reproducibility", label: "Reproducibility" },
  { id: "limitations", label: "Known Limitations" },
  { id: "roadmap", label: "Roadmap" },
] as const;

const ARCHITECTURE_DIAGRAM = `flowchart TB
    subgraph engine [Analysis Engine]
        AST[AST Parsing]
        Metrics[Function Metrics]
        Git[Workflow Metrics]
        Dup[Duplication]
    end
    subgraph dash [Dashboard]
        API[API Route]
        UI[Render Metrics]
    end
    subgraph persist [Supabase]
        DB[(analyses)]
    end
    URL[GitHub URL] --> API
    API --> engine
    engine --> API
    API --> DB
    DB --> UI`;

const GIT_METRICS_DIAGRAM = `flowchart TD
    Start[GitHub URL] --> TryClone[Try git clone]
    TryClone -->|success| Local[git.mode = local]
    TryClone -->|git unavailable| Zipball[Download zipball]
    Zipball --> Analyze[analyzeRepo]
    Analyze --> GitNull[git: null]
    GitNull --> API[extractGitMetricsApi]
    API -->|success| ApiMode[git.mode = api]
    API -->|fail| NoneMode[git.mode = none]
    Local --> Done[Report ready]
    ApiMode --> Done
    NoneMode --> Done`;

export default function DocsContent() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documentation</h1>
        <p className="mt-1 text-muted-foreground">
          Technical documentation for the Repo Metrics Dashboard. Clarity over volume.
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4 grid w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
          {DOC_TABS.map(({ id, label }) => (
            <TabsTrigger key={id} value={id} className="text-xs sm:text-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="architecture">
          <ArchitectureTab />
        </TabsContent>
        <TabsContent value="git-metrics">
          <GitMetricsTab />
        </TabsContent>
        <TabsContent value="metrics">
          <MetricsTab />
        </TabsContent>
        <TabsContent value="reproducibility">
          <ReproducibilityTab />
        </TabsContent>
        <TabsContent value="limitations">
          <LimitationsTab />
        </TabsContent>
        <TabsContent value="roadmap">
          <RoadmapTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Purpose and scope</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong>Repo Metrics Dashboard</strong> is a repository analysis system designed
            to extract structured software engineering signals from Git-based student team
            projects.
          </p>
          <p>The system transforms a public GitHub repository into:</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Workflow behavior metrics</li>
            <li>Verification discipline indicators</li>
            <li>Structural quality measurements</li>
            <li>A reproducible feature vector</li>
            <li>A durable, queryable research record</li>
          </ul>
          <p className="text-muted-foreground">
            Each analysis result is persisted in Supabase and can be retrieved by{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">result_id</code>, ensuring
            reproducibility across serverless deployments.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Intended Use</CardTitle>
          <CardDescription>Research contexts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Longitudinal educational research</li>
            <li>Cohort comparison (AI-era vs pre-AI)</li>
            <li>Engineering practice analysis</li>
            <li>Feature generation for statistical modeling</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What It Is Not</CardTitle>
          <CardDescription>Important framing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            This system is framed as a research instrument, not a production tool:
          </p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Not a code grader</li>
            <li>Not an AI tool evaluator</li>
            <li>Not a static security analyzer</li>
            <li>Not a developer productivity dashboard</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Architecture</CardTitle>
          <CardDescription>Three layers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <MermaidDiagram code={ARCHITECTURE_DIAGRAM} className="my-4" />

          <section>
            <h3 className="mb-2 font-semibold">1. Analysis Engine (packages/engine)</h3>
            <p className="mb-2 text-muted-foreground">
              A reusable TypeScript engine responsible for:
            </p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>Static code analysis (Tree-sitter)</li>
              <li>Function metrics, cyclomatic complexity</li>
              <li>Code smell detection</li>
              <li>Duplication detection (jscpd)</li>
              <li>Maintainability index</li>
              <li>Workflow metrics (local git or GitHub API)</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              The engine supports two ingestion modes, recorded in <code className="rounded bg-muted px-1 py-0.5">git.mode</code>:
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">Mode</th>
                    <th className="py-2 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2"><code>local</code></td>
                    <td className="py-2">Full git clone with .git directory</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2"><code>api</code></td>
                    <td className="py-2">Zipball + GitHub API fallback (no git CLI required)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2"><code>none</code></td>
                    <td className="py-2">Git history unavailable</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">2. Dashboard (Next.js + Vercel)</h3>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>Accepts a public GitHub URL</li>
              <li>Runs analysis via server-side API route</li>
              <li>Persists results in Supabase</li>
              <li>Renders metrics grouped by research constructs</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Runtime: <strong>Node.js</strong> (serverless-compatible)
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">3. Persistence Layer (Supabase)</h3>
            <p className="mb-2 text-muted-foreground">
              All analysis results are stored in Supabase. Table: <code className="rounded bg-muted px-1 py-0.5">analyses</code>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">Column</th>
                    <th className="py-2 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b"><td className="py-2">id</td><td className="py-2">UUID primary key</td></tr>
                  <tr className="border-b"><td className="py-2">result_id</td><td className="py-2">URL-safe identifier</td></tr>
                  <tr className="border-b"><td className="py-2">repo_url</td><td className="py-2">Repository URL</td></tr>
                  <tr className="border-b"><td className="py-2">commit_sha</td><td className="py-2">Commit analyzed</td></tr>
                  <tr className="border-b"><td className="py-2">analyzed_at</td><td className="py-2">Timestamp</td></tr>
                  <tr className="border-b"><td className="py-2">report_json</td><td className="py-2">Full RepoReport JSON</td></tr>
                  <tr className="border-b"><td className="py-2">summary_json</td><td className="py-2">Aggregated metrics for UI</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-muted-foreground">
              Provides cross-instance durability, shareable result URLs, and dataset export capability.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function GitMetricsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Git Metrics Strategy</CardTitle>
          <CardDescription>Problem and solution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <section>
            <h3 className="mb-2 font-semibold">Problem</h3>
            <p className="text-muted-foreground">
              Vercel does not provide a <code className="rounded bg-muted px-1 py-0.5">git</code> binary.
              When full clone fails, the engine falls back to zipball download. Zipballs do not
              contain <code className="rounded bg-muted px-1 py-0.5">.git</code>, so local git
              metrics are unavailable.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Solution</h3>
            <p className="mb-4 text-muted-foreground">
              A GitHub API-based fallback was implemented. When git CLI is unavailable:
            </p>
            <MermaidDiagram code={GIT_METRICS_DIAGRAM} className="my-4" />
            <ul className="mt-4 list-inside list-disc space-y-1 text-muted-foreground">
              <li>Commit history is fetched via GitHub REST API</li>
              <li>Workflow metrics are derived from timestamps and commit messages</li>
              <li><code className="rounded bg-muted px-1 py-0.5">git.mode = "api"</code></li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">API-derived metrics</h3>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>Total commits (last 90 days)</li>
              <li>Commits per week</li>
              <li>Active commit days</li>
              <li>Median inter-commit interval</li>
              <li>Burst ratio</li>
              <li>Median commit message length</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Modes</h3>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li><strong>Local:</strong> Full git history; <code className="rounded bg-muted px-1 py-0.5">git.mode = "local"</code></li>
              <li><strong>API:</strong> Fallback when git unavailable</li>
              <li><strong>None:</strong> <code className="rounded bg-muted px-1 py-0.5">git.mode = "none"</code> — UI displays metrics as unavailable (not zero)</li>
            </ul>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Commit & Workflow Practices</CardTitle>
          <CardDescription>RQ1 construct</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Commits per week</li>
            <li>Burst ratio</li>
            <li>Activity concentration</li>
            <li>Commit message informativeness</li>
            <li>Git ingestion mode</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification Discipline</CardTitle>
          <CardDescription>RQ2 construct</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Test density</li>
            <li>Error-handling smells</li>
            <li>Refactor patterns (local git only)</li>
            <li>Test-touch commit ratio (local git only)</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project Quality</CardTitle>
          <CardDescription>RQ3 construct</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Cyclomatic complexity (mean + p90)</li>
            <li>Long function count</li>
            <li>Nesting depth</li>
            <li>Duplication %</li>
            <li>Maintainability index</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Structural Risk Index</CardTitle>
          <CardDescription>Composite metric</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Based on: high-complexity functions, long methods, duplication concentration.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification Index</CardTitle>
          <CardDescription>Composite metric</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Based on: test presence, smell reduction, structural hygiene indicators.
        </CardContent>
      </Card>
    </div>
  );
}

function ReproducibilityTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recorded Metadata</CardTitle>
          <CardDescription>Each analysis records</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Repository URL</li>
            <li>Commit SHA</li>
            <li>Analyzer version</li>
            <li>Ingestion mode</li>
            <li>Timestamp</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            Given a commit SHA and engine version, results are deterministic.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Threshold Defaults</CardTitle>
          <CardDescription>Configurable constants</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>High complexity:</strong> ≥ 10 (cyclomatic complexity)</p>
          <p><strong>Long method:</strong> ≥ 50 LOC</p>
          <p><strong>Large commit:</strong> ≥ 500 LOC</p>
          <p><strong>Deep nesting:</strong> ≥ 4 levels</p>
        </CardContent>
      </Card>
    </div>
  );
}

function LimitationsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Known Limitations</CardTitle>
          <CardDescription>What to be aware of</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>API-based git metrics do not include diff-level churn.</li>
            <li>Large repositories may be constrained by serverless limits.</li>
            <li>Duplication detection depends on jscpd execution environment.</li>
            <li>Full git history metrics require local/worker execution.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function RoadmapTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Roadmap</CardTitle>
          <CardDescription>Planned enhancements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Background job processing for large repositories</li>
            <li>CSV dataset export</li>
            <li>PR and issue-based collaboration metrics</li>
            <li>Enhanced verification modeling</li>
            <li>Longitudinal cohort comparison tools</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
