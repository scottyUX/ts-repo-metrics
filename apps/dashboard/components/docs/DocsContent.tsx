"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DOC_TABS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "metrics", label: "Metrics & Definitions" },
  { id: "pipeline", label: "Data Pipeline" },
  { id: "reproducibility", label: "Reproducibility" },
] as const;

export default function DocsContent() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Docs</h1>
        <p className="mt-1 text-muted-foreground">
          Technical documentation for the repository mining engine. Clarity over volume.
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4 grid w-full grid-cols-2 sm:grid-cols-5">
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
        <TabsContent value="metrics">
          <MetricsTab />
        </TabsContent>
        <TabsContent value="pipeline">
          <PipelineTab />
        </TabsContent>
        <TabsContent value="reproducibility">
          <ReproducibilityTab />
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
          <CardTitle>What This System Is</CardTitle>
          <CardDescription>Purpose and scope</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <code className="rounded bg-muted px-1.5 py-0.5">ts-repo-metrics</code> is a
            repository mining engine designed to extract structured software engineering
            signals from Git-based student team projects.
          </p>
          <p>The system transforms a repository into:</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Workflow behavior metrics</li>
            <li>Verification discipline indicators</li>
            <li>Structural quality measurements</li>
            <li>A reproducible feature vector suitable for research analysis</li>
          </ul>
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
          <CardTitle>System Layers</CardTitle>
          <CardDescription>Internal architecture</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <section>
            <h3 className="mb-2 font-semibold">1. Repository Ingestion Layer</h3>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>Clones public GitHub repositories</li>
              <li>Resolves commit SHA</li>
              <li>Filters relevant source files (.ts, .tsx)</li>
              <li>Handles parse errors safely (files skipped, not failure)</li>
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">2. Static Analysis Engine</h3>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>AST parsing via Tree-sitter</li>
              <li>Per-function metric extraction: cyclomatic complexity, function length, nesting depth, parameter count</li>
              <li>Code smell detection</li>
              <li>Duplication detection (jscpd)</li>
              <li>Maintainability index computation</li>
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">3. Git Mining Engine</h3>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>Commit count and frequency</li>
              <li>Commit size distribution (median, p90)</li>
              <li>Large commit ratio (≥500 LOC)</li>
              <li>Churn statistics (top files by modifications, lines changed)</li>
              <li>Burst detection, entropy, refactor commit rate, test-touch rate</li>
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">4. Feature Engineering Layer</h3>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>Aggregation of per-file and per-function metrics</li>
              <li>Percentile calculations (p50, p75, p90)</li>
              <li>Concentration metrics (e.g., high-complexity in top 10% of files)</li>
              <li>Verification ratios</li>
              <li>Dataset-ready feature vector</li>
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
          <CardTitle>Verification Discipline</CardTitle>
          <CardDescription>RQ2 construct</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h4 className="mb-1 font-medium">Test Density</h4>
            <p className="text-muted-foreground">Formula: LOC<sub>tests</sub> / (LOC<sub>source</sub> + 1)</p>
          </div>
          <div>
            <h4 className="mb-1 font-medium">Test-Touch Commit Rate</h4>
            <p className="text-muted-foreground">Proportion of commits modifying test files.</p>
          </div>
          <div>
            <h4 className="mb-1 font-medium">Refactor Commit Rate</h4>
            <p className="text-muted-foreground">Commits with refactor/cleanup/restructure/rename in message ÷ total commits.</p>
          </div>
          <div>
            <h4 className="mb-1 font-medium">Error-Handling Anti-Patterns</h4>
            <p className="text-muted-foreground">Empty catch blocks; suppressed exceptions. Reported as smell counts.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commit & Workflow Practices</CardTitle>
          <CardDescription>RQ1 construct</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li><strong>Total Commits</strong> — Count in analyzed history</li>
            <li><strong>Commits per Week</strong> — Last 13 weeks</li>
            <li><strong>Median Commit Size</strong> — Lines changed per commit</li>
            <li><strong>Large Commit Rate</strong> — % commits &gt; 500 LOC</li>
            <li><strong>Burst Ratio</strong> — % of commits in bursts (≥3 in 30 min)</li>
            <li><strong>Commit Entropy</strong> — Std dev of time between commits (ms)</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project Quality</CardTitle>
          <CardDescription>RQ3 construct</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li><strong>Mean Cyclomatic Complexity</strong> — Across all functions</li>
            <li><strong>90th Percentile Complexity</strong> — Tail risk</li>
            <li><strong>Long Method Count</strong> — Functions ≥ 50 LOC</li>
            <li><strong>Function Length Distribution</strong> — p50, p75, p90</li>
            <li><strong>Nesting Depth</strong> — Max nesting level</li>
            <li><strong>Duplication Rate</strong> — jscpd percentage</li>
            <li><strong>Maintainability Index</strong> — Composite (0–100)</li>
            <li><strong>Code Smell Breakdown</strong> — Long functions, deep nesting, long params, empty catches, console.logs</li>
            <li><strong>Concentration</strong> — % high-complexity functions in top 10% of files by complexity</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function PipelineTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Data Pipeline</CardTitle>
          <CardDescription>End-to-end flow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <section>
            <h3 className="mb-2 font-semibold">Step 1: Repository Snapshot</h3>
            <p className="text-muted-foreground">A specific commit SHA is analyzed. The repo is cloned (or cached) and checked out at that commit.</p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Step 2: Static Extraction</h3>
            <p className="text-muted-foreground">Source files parsed with Tree-sitter. Per-function metrics (length, complexity, nesting, params) and smells extracted.</p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Step 3: Git Mining</h3>
            <p className="text-muted-foreground">Commit history analyzed for count, size, frequency, bursts, churn, refactor rate, test-touch rate.</p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Step 4: Feature Aggregation</h3>
            <p className="text-muted-foreground">Metrics transformed into a structured dataset row (feature vector). Percentiles and concentration computed.</p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Step 5: Dashboard Rendering</h3>
            <p className="text-muted-foreground">Results grouped by RQ and construct. Dataset tab exposes raw feature vector and metadata for inspection.</p>
          </section>
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
            <li>Branch</li>
            <li>Analysis timestamp (ISO 8601)</li>
            <li>Analyzer version</li>
            <li>Files analyzed</li>
            <li>Files skipped</li>
          </ul>
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

      <Card>
        <CardHeader>
          <CardTitle>Determinism</CardTitle>
          <CardDescription>Research credibility</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            All results are deterministic for a given commit. Re-running analysis on the same
            repository at the same commit yields identical output. This makes the system
            research-safe and auditable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
