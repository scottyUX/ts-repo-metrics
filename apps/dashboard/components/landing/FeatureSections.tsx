"use client";

import { Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Mock: Testing — scatter chart
// ---------------------------------------------------------------------------

const SCATTER_LEGEND = [
  { color: "bg-red-500",    label: "Critical" },
  { color: "bg-orange-500", label: "High" },
  { color: "bg-yellow-500", label: "Medium" },
  { color: "bg-green-500",  label: "Low" },
] as const;

function ScatterChartMock() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card p-4">
      <p className="mb-4 text-center text-[11px] text-muted-foreground">
        Cyclomatic complexity vs three test-proximity bands (not a 0–1 scale)
      </p>
      <div className="flex gap-3">
        {/* Y-axis labels */}
        <div className="flex w-28 shrink-0 flex-col justify-between py-1 text-right">
          <span className="text-[10px] leading-tight text-muted-foreground">
            Name in paired test<br />score 1.0
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            Test file paired only<br />score 0.3
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            No paired test<br />score 0
          </span>
        </div>

        {/* Dot area */}
        <div className="flex-1 space-y-1 border-l border-border/40 pl-3">
          {/* Band 1 — many green, few orange */}
          <div className="flex h-14 flex-wrap items-center gap-1 border-b border-border/20">
            {Array.from({ length: 8 }).map((_, i) => <span key={i} className="size-2.5 rounded-full bg-green-500/80" />)}
            {Array.from({ length: 5 }).map((_, i) => <span key={i} className="size-2.5 rounded-full bg-yellow-500/80" />)}
            <span className="ml-2 size-2.5 rounded-full bg-orange-500/80" />
            <span className="ml-4 size-2.5 rounded-full bg-orange-400/80" />
            <span className="ml-3 size-2.5 rounded-full bg-red-400/80" />
          </div>
          {/* Band 2 — mixed */}
          <div className="flex h-14 flex-wrap items-center gap-1 border-b border-border/20">
            {Array.from({ length: 5 }).map((_, i) => <span key={i} className="size-2.5 rounded-full bg-green-500/80" />)}
            {Array.from({ length: 4 }).map((_, i) => <span key={i} className="ml-1 size-2.5 rounded-full bg-yellow-500/80" />)}
            <span className="ml-3 size-2.5 rounded-full bg-yellow-400/80" />
            <span className="ml-2 size-2.5 rounded-full bg-orange-500/80" />
            <span className="ml-4 size-2.5 rounded-full bg-red-500/80" />
            <span className="ml-2 size-2.5 rounded-full bg-red-400/80" />
          </div>
          {/* Band 3 — sparse, high complexity */}
          <div className="flex h-14 flex-wrap items-start gap-1 pt-2">
            {Array.from({ length: 3 }).map((_, i) => <span key={i} className="size-2.5 rounded-full bg-green-500/80" />)}
            <span className="ml-3 size-2.5 rounded-full bg-yellow-500/80" />
            <span className="ml-4 size-2.5 rounded-full bg-orange-500/80" />
            {Array.from({ length: 2 }).map((_, i) => <span key={i} className="ml-3 size-2.5 rounded-full bg-red-500/80" />)}
            {Array.from({ length: 3 }).map((_, i) => <span key={i} className="ml-2 size-2.5 rounded-full bg-red-500/80" />)}
          </div>
        </div>
      </div>

      {/* X-axis */}
      <div className="mt-1 flex justify-between pl-32 text-[10px] text-muted-foreground">
        <span>0</span>
        <span>Cyclomatic complexity</span>
        <span>17+</span>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="font-medium">Dot color = risk tier:</span>
        {SCATTER_LEGEND.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`size-2 rounded-full ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock: Code Quality — risk profile quadrant
// ---------------------------------------------------------------------------

function RiskProfileMock() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card p-5">
      <h3 className="font-semibold">Your risk profile</h3>
      <p className="mb-4 mt-0.5 text-xs text-muted-foreground">
        Structural risk from complexity + long functions versus verification density
      </p>
      <div className="flex gap-4">
        {/* 2×2 grid */}
        <div className="grid flex-1 grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Low Verification</p>
            <p className="mt-1 font-semibold">Low risk / Low verification</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Fine while complexity stays low — watch both as the codebase grows.</p>
          </div>
          <div className="rounded-lg border border-green-600/40 bg-green-950/20 p-3">
            <span className="rounded-full border border-green-600/40 px-1.5 py-0.5 text-[9px] text-green-400">Ideal</span>
            <p className="mt-1 font-semibold text-green-400">Low risk / High verification</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Strong verification density — a good balance for this summary view.</p>
          </div>
          <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-3">
            <span className="rounded-full border border-amber-600/40 px-1.5 py-0.5 text-[9px] text-amber-400">You are here</span>
            <p className="mt-1 font-semibold text-amber-400">High risk / Low verification</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Complex areas with comparatively little test code — bugs are harder to catch.</p>
          </div>
          <div className="rounded-lg border border-amber-600/20 bg-background/40 p-3">
            <p className="mt-1 font-semibold">High risk / High verification</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Complexity is elevated but test density helps offset it.</p>
          </div>
        </div>

        {/* Score sidebar */}
        <div className="w-28 shrink-0 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Structural Risk</p>
            <p className="text-2xl font-bold text-red-400">100%</p>
            <span className="rounded-full bg-red-950/40 px-1.5 py-0.5 text-[9px] text-red-400">High band</span>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Verification</p>
            <p className="text-2xl font-bold text-amber-400">40%</p>
            <span className="rounded-full bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-400">Low band</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock: Code Complexity — distribution card
// ---------------------------------------------------------------------------

const COMPLEXITY_STATS = [
  { label: "Total Functions",           value: "1675", color: "text-foreground" },
  { label: "High Complexity (> 15)",    value: "25",   color: "text-amber-400" },
  { label: "Critical Complexity (> 30)",value: "10",   color: "text-red-400" },
  { label: "Healthy Functions (< 10)",  value: "1593", color: "text-green-400" },
] as const;

function ComplexityMock() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card p-5">
      <h3 className="font-semibold">Complexity Distribution</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Where complexity is concentrated across analyzed functions.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-5">
        <div className="space-y-1">
          <p className="text-4xl font-bold text-amber-400">52.40%</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
            High Complexity Concentration
          </p>
          <p className="text-xs text-muted-foreground">
            of high-complexity burden sits in the busiest files (top 10% by function count).
          </p>
        </div>
        <div className="col-span-2 space-y-3">
          <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
            💡 Fix the top five hotspots in the complexity tables below for a meaningful drop in structural complexity in this view.
          </div>
          <div className="space-y-2">
            {COMPLEXITY_STATS.map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
                <span className={`text-sm font-bold ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock: React Components — oversized components table
// ---------------------------------------------------------------------------

const COMPONENT_ROWS = [
  { name: "CourseAnalyzePage",   file: "app/course/[courseId]/analyze/p…", sloc: 431, depth: 6,  hooks: 20 },
  { name: "TestingMetricsTab",   file: "components/results/rq/TestingMe…", sloc: 411, depth: 6,  hooks: 9  },
  { name: "Phase3PathologyTab",  file: "components/results/rq/Phase3Pat…", sloc: 410, depth: 6,  hooks: 3  },
  { name: "Phase2ComplexityTab", file: "components/results/rq/Phase2Com…", sloc: 368, depth: 11, hooks: 9  },
  { name: "HeaderNavClient",     file: "components/HeaderNavClient.tsx",    sloc: 365, depth: 4,  hooks: 11 },
] as const;

function slocColor(sloc: number): string {
  if (sloc >= 400) return "text-red-400";
  if (sloc >= 300) return "text-amber-400";
  return "text-foreground";
}

function ReactComponentsMock() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-start justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="font-semibold">Top Oversized Components</h3>
          <p className="text-xs text-muted-foreground">
            Largest TSX components by line span — start splitting here before layering new behavior.
          </p>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">Sorted by SLOC (descending)</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2 font-medium">Component</th>
            <th className="px-3 py-2 font-medium">SLOC</th>
            <th className="px-3 py-2 font-medium">JSX depth</th>
            <th className="px-3 py-2 font-medium">Hooks</th>
          </tr>
        </thead>
        <tbody>
          {COMPONENT_ROWS.map((r) => (
            <tr key={r.name} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
              <td className="px-4 py-2.5 font-medium text-primary">{r.name}</td>
              <td className={`px-3 py-2.5 font-semibold ${slocColor(r.sloc)}`}>{r.sloc}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{r.depth}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{r.hooks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-[10px] text-muted-foreground">
        Tip: Components over{" "}
        <strong className="text-foreground">100 SLOC</strong> deserve a review for splitting; over{" "}
        <strong className="text-foreground">200</strong> is a strong refactor signal.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock: AI Usage — weekly AI vs human bar chart
// ---------------------------------------------------------------------------

const AI_WEEKS = [
  { week: "W1", ai: 2,  human: 18 },
  { week: "W2", ai: 5,  human: 15 },
  { week: "W3", ai: 8,  human: 12 },
  { week: "W4", ai: 12, human: 8  },
  { week: "W5", ai: 9,  human: 11 },
  { week: "W6", ai: 14, human: 6  },
] as const;

function AIUsageMock() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card p-5">
      <h3 className="font-semibold">AI Usage Trends</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        AI-assisted vs human-authored commits week over week
      </p>
      <div className="mt-5 space-y-2.5">
        {AI_WEEKS.map(({ week, ai, human }) => {
          const total = ai + human;
          const aiPct = Math.round((ai / total) * 100);
          return (
            <div key={week} className="flex items-center gap-3">
              <span className="w-6 text-[10px] text-muted-foreground">{week}</span>
              <div className="flex h-4 flex-1 overflow-hidden rounded-sm bg-muted/30">
                <div
                  className="bg-blue-500/70 transition-all"
                  style={{ width: `${aiPct}%` }}
                />
              </div>
              <span className="w-8 text-right text-[10px] text-muted-foreground">{aiPct}%</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-blue-500/70" />
          AI-assisted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted/60" />
          Human-authored
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock: Documentation — required documents table
// ---------------------------------------------------------------------------

const REQUIRED_DOCS_PREVIEW = [
  "Release Plan",      "Sprint 1 Plan",
  "Sprint 2 Plan",     "Sprint 3 Plan",
  "Sprint 4 Plan",     "Sprint 1 Report",
  "Sprint 2 Report",   "Sprint 3 Report",
  "Sprint 4 Report",   "Test Plan",
  "Definition of Done","Code Standards",
] as const;

function DocumentationMock() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="font-semibold">Required Documents</h3>
          <p className="text-xs text-muted-foreground">
            All 12 required course documents and their status.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-foreground"
        >
          Re-run review
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 px-4 py-2">
        {REQUIRED_DOCS_PREVIEW.map((label) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-border/40 py-2 last:border-0"
          >
            <span className="text-xs font-medium">{label}</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-500">
              <Check className="size-3" aria-hidden />
              OK
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature section wrapper
// ---------------------------------------------------------------------------

type Bullet = { label: string; href?: string; text: string };

function FeatureSection({
  title,
  lead,
  bullets,
  mock,
  reversed = false,
}: {
  title: string;
  lead: string;
  bullets?: Bullet[];
  mock: React.ReactNode;
  reversed?: boolean;
}) {
  // Text column is always the narrower (2fr); mock is always the wider (3fr).
  // When reversed: swap visual order while keeping column widths correct.
  const gridCols = reversed ? "lg:grid-cols-[3fr_2fr]" : "lg:grid-cols-[2fr_3fr]";

  return (
    <div className="w-full border-t border-border/40 py-16 sm:py-20">
      <div className={`mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 lg:gap-20 ${gridCols}`}>
        {/* Text — order-2 when reversed so it sits in the right column */}
        <div className={`space-y-5 ${reversed ? "lg:order-2" : ""}`}>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          <p className="leading-relaxed text-muted-foreground">{lead}</p>
          {bullets?.map((b) => (
            <p key={b.label} className="leading-relaxed text-muted-foreground">
              {b.href ? (
                <a
                  href={b.href}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {b.label}
                </a>
              ) : (
                <strong className="font-semibold text-foreground">{b.label}</strong>
              )}{" "}
              {b.text}
            </p>
          ))}
        </div>

        {/* Mock — order-1 when reversed so it sits in the left column */}
        <div className={reversed ? "lg:order-1" : ""}>{mock}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function FeatureSections() {
  return (
    <div className="w-full">
      <FeatureSection
        title="Map complexity against test coverage"
        lead="Complexity alone does not tell the full story. The scatter plot pairs cyclomatic complexity with test proximity so you can see which functions are both hard to understand and unprotected by tests."
        bullets={[
          { label: "Test proximity bands", text: "rank every function as name-paired (score 1.0), file-paired (score 0.3), or untested (score 0) — giving you a concrete priority order, not a coverage percentage." },
          { label: "Risk tiers", text: "colour each dot Critical, High, Medium, or Low so high-complexity untested functions jump out immediately, even in a codebase with thousands of functions." },
        ]}
        mock={<ScatterChartMock />}
      />

      <FeatureSection
        title="Understand your structural risk profile"
        lead="The risk matrix combines structural complexity with verification density into a single quadrant view. You can see at a glance whether your team is in a safe zone or heading toward a maintenance crisis."
        bullets={[
          { label: "Structural risk score", text: "counts high-complexity and long functions as a ratio — independent of test coverage tooling, so it works on any language or stack." },
          { label: "Verification score", text: "measures how much of your source is test code. Reaching the top-right 'Ideal' quadrant means your testing effort is proportional to your complexity burden." },
        ]}
        mock={<RiskProfileMock />}
        reversed
      />

      <FeatureSection
        title="Find complexity hotspots instantly"
        lead="Most complexity is not spread evenly — it clusters. The distribution view shows what share of your total complexity burden lives in your busiest files so you know exactly where to focus a refactor."
        bullets={[
          { label: "Concentration metric", text: "tells you what percentage of high-complexity functions sit in the top 10% of files by function count. A high number means a small set of targeted refactors can move the overall score significantly." },
          { label: "Outlier table", text: "lists the functions with the highest Halstead volume and cognitive complexity so you can start with the most impactful changes, not the most recent ones." },
        ]}
        mock={<ComplexityMock />}
      />

      <FeatureSection
        title="Spot oversized React components"
        lead="Large components accumulate state, side effects, and rendering logic until they become unmaintainable. The oversized components table surfaces the files that most need splitting before new behaviour is layered on top."
        bullets={[
          { label: "SLOC threshold", text: "components above 100 lines deserve a splitting review; above 200 is a strong signal. The table sorts by SLOC descending so the worst offenders are always at the top." },
          { label: "JSX depth and hook count", text: "give additional signals — deep nesting and many hooks in one component often indicate mixed concerns that belong in separate files." },
        ]}
        mock={<ReactComponentsMock />}
        reversed
      />

      <FeatureSection
        title="Track AI-assisted development"
        lead="As AI tools become part of everyday development, understanding how they are being used matters. The AI usage view shows the week-over-week balance between AI-assisted and human-authored commits."
        bullets={[
          { label: "Trend over time", text: "makes it easy to see whether AI adoption is growing, plateauing, or concentrated in particular sprints — useful context when reviewing velocity changes." },
          { label: "Per-author breakdown", text: "lets instructors and team leads understand individual contribution patterns without conflating AI-generated output with human engineering effort." },
        ]}
        mock={<AIUsageMock />}
      />

      <FeatureSection
        title="Automated documentation review"
        lead="The documentation tab classifies every file in the repository's documentation folder against fixed course rubrics — no manual tagging or configuration required. Results are stored alongside the code metrics so they are always one click away."
        bullets={[
          { label: "Required documents checklist", text: "tracks all 12 course documents — release plan, four sprint plans, four sprint reports, test plan, definition of done, and code standards — and shows OK, Missing, or Needs Attention at a glance." },
          { label: "Rubric-driven feedback", text: "each document type has a tailored checklist of pass/fail criteria drawn from course slides, plus a coach feedback field with concrete suggestions for improvement." },
        ]}
        mock={<DocumentationMock />}
        reversed
      />
    </div>
  );
}
