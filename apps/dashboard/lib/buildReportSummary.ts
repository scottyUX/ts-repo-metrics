/**
 * Extracts a rich text summary from a RepoReport for use as AI chatbot context.
 * Includes aggregate metrics AND per-component/per-file/per-function detail so
 * the chatbot can answer specific "which file / which component?" questions.
 * Targets ~3 000–5 000 tokens — negligible cost, much better answers.
 */
import type { RepoReport } from "@/lib/reportTypes";

export function buildReportSummary(report: RepoReport): string {
  const lines: string[] = [];

  const repoUrl = report.source?.url ?? report.repoPath ?? "unknown";
  const commit = report.source?.commit?.slice(0, 7) ?? "unknown";
  lines.push(`REPO: ${repoUrl} (commit: ${commit})`);

  // ── Profile ──────────────────────────────────────────────────────────────
  const p = report.profile;
  lines.push(
    `FILES: ${p.totalFiles} total | ${p.tsFiles} .ts | ${p.tsxFiles} .tsx | ${p.jsFiles ?? 0} .js | ${p.jsxFiles ?? 0} .jsx | ${p.pyFiles ?? 0} .py | ${p.testFiles} test`,
  );
  lines.push(
    `LINES: ${p.totalLOC} total LOC | ${p.sourceLOC} source | ${p.testLOC} test`,
  );

  // ── Functions & complexity ────────────────────────────────────────────────
  const fm = report.functionMetricsSummary;
  lines.push(
    `FUNCTIONS: ${fm.totalFunctions} total | avg length ${fm.averageLength.toFixed(1)} lines | max nesting ${fm.maxNestingDepth}`,
  );
  const cx = report.complexity;
  lines.push(
    `COMPLEXITY: avg ${cx.average.toFixed(2)} | max ${cx.max} | high-complexity functions: ${cx.highComplexityFunctions}`,
  );

  // ── Maintainability ───────────────────────────────────────────────────────
  if (report.maintainability) {
    lines.push(
      `MAINTAINABILITY: score ${report.maintainability.score.toFixed(1)} (${report.maintainability.classification})`,
    );
  }

  // ── Test coverage proxy ───────────────────────────────────────────────────
  if (report.testCoverageProxy) {
    const tc = report.testCoverageProxy;
    lines.push(
      `TEST COVERAGE PROXY: ratio ${(tc.ratio * 100).toFixed(1)}% (${tc.classification})`,
    );
  }

  // ── Code smells ───────────────────────────────────────────────────────────
  const s = report.smells;
  lines.push(
    `CODE SMELLS: long functions ${s.longFunctions} | deep nesting ${s.deepNesting} | long param lists ${s.longParameterLists} | empty catch ${s.emptyCatchBlocks} | console.log ${s.consoleLogs}`,
  );

  // ── Duplication ───────────────────────────────────────────────────────────
  if (report.duplication) {
    const d = report.duplication;
    lines.push(
      `DUPLICATION: ${d.percentage.toFixed(1)}% duplicated lines | ${d.cloneClusters} clone clusters`,
    );
  }

  // ── Git metrics ───────────────────────────────────────────────────────────
  if (report.git) {
    const g = report.git;
    lines.push(
      `GIT: ${g.totalCommits} commits | median commit size ${g.medianCommitSize} lines | ${g.commitsPerWeek.toFixed(1)}/week | large commit ratio ${(g.largeCommitRatio * 100).toFixed(1)}%`,
    );
  }
  if (report.gitMetricsV2) {
    const gv2 = report.gitMetricsV2;
    lines.push(
      `GIT V2: refactor ratio ${(gv2.refactorBehavior.refactorCommitRatio * 100).toFixed(1)}% | test-coupling ${(gv2.testCoupling.pctCommitsTouchingTests * 100).toFixed(1)}% commits touch tests`,
    );
  }

  // ── Top churn hotspots ────────────────────────────────────────────────────
  if (report.gitMetricsV2?.churn?.topByModifications) {
    const hotspots = (
      report.gitMetricsV2.churn.topByModifications as Array<{
        file?: string;
        modifications?: number;
      }>
    ).slice(0, 8);
    if (hotspots.length > 0) {
      lines.push("TOP CHURN HOTSPOTS (most frequently modified files):");
      for (const h of hotspots) {
        if (h.file) {
          lines.push(`  ${h.file}${h.modifications != null ? ` — ${h.modifications} modifications` : ""}`);
        }
      }
    }
  }

  // ── Phase 3 — AI smells / pathology ──────────────────────────────────────
  if (report.phase3) {
    const ph3 = report.phase3;
    lines.push(
      `AI SMELLS: SFD (silent failure density) ${ph3.sfd.toFixed(4)} | SRS (structural redundancy) ${ph3.srs.toFixed(4)} | monolithic components ${ph3.monolithicComponentCount} of ${ph3.reactComponentCount} React components`,
    );

    // Silent failure locations
    if (ph3.silentFailureEvents && ph3.silentFailureEvents.length > 0) {
      const events = ph3.silentFailureEvents.slice(0, 15);
      lines.push("SILENT FAILURES (empty/console-only catch blocks):");
      for (const ev of events) {
        lines.push(`  ${ev.file}:${ev.line} (${ev.kind})`);
      }
      if (ph3.silentFailureEvents.length > 15) {
        lines.push(`  … and ${ph3.silentFailureEvents.length - 15} more`);
      }
    }
  }

  // ── React component metrics ───────────────────────────────────────────────
  if (report.reactMetrics) {
    const rm = report.reactMetrics.summary;
    lines.push(
      `REACT SUMMARY: ${rm.componentsAnalyzed} components | lack-of-cohesion violations ${rm.ferreiraLackOfCohesionCount} | deep JSX violations ${rm.tampereJsxDepthExceededCount} | prop-drilling edges ${rm.totalPropDrillingEdges} | max JSX depth ${rm.maxJsxDepthRepo}`,
    );

    // Monolithic React components (>50 lines), sorted by size
    const monolithic = report.reactMetrics.components
      .filter((c) => c.lines > 50)
      .sort((a, b) => b.lines - a.lines);
    if (monolithic.length > 0) {
      lines.push(`MONOLITHIC REACT COMPONENTS (>${50} lines, ${monolithic.length} total):`);
      for (const c of monolithic) {
        lines.push(`  ${c.file}:${c.startLine} ${c.name} — ${c.lines} lines`);
      }
    }

    // Components with hook safety issues
    const hookIssues = report.reactMetrics.components.filter(
      (c) =>
        c.hookSafety.conditionalHookCalls > 0 ||
        c.hookSafety.asyncUseEffect > 0 ||
        c.hookSafety.missingOrInvalidDepsArray > 0,
    );
    if (hookIssues.length > 0) {
      lines.push("REACT HOOK SAFETY ISSUES:");
      for (const c of hookIssues.slice(0, 10)) {
        const issues: string[] = [];
        if (c.hookSafety.conditionalHookCalls > 0) issues.push(`conditional hooks: ${c.hookSafety.conditionalHookCalls}`);
        if (c.hookSafety.asyncUseEffect > 0) issues.push(`async useEffect: ${c.hookSafety.asyncUseEffect}`);
        if (c.hookSafety.missingOrInvalidDepsArray > 0) issues.push(`missing deps: ${c.hookSafety.missingOrInvalidDepsArray}`);
        lines.push(`  ${c.file}:${c.startLine} ${c.name} — ${issues.join(" | ")}`);
      }
    }

    // Prop-drilling hotspots (top 5)
    const propDrilling = report.reactMetrics.components
      .filter((c) => c.propDrillingEdges > 0)
      .sort((a, b) => b.propDrillingEdges - a.propDrillingEdges)
      .slice(0, 5);
    if (propDrilling.length > 0) {
      lines.push("PROP-DRILLING HOTSPOTS:");
      for (const c of propDrilling) {
        lines.push(`  ${c.file}:${c.startLine} ${c.name} — ${c.propDrillingEdges} edges`);
      }
    }
  }

  // ── Top high-complexity functions ─────────────────────────────────────────
  const highComplexFns: Array<{ file: string; name: string; complexity: number; lines: number }> = [];
  for (const fileEntry of report.perFile ?? []) {
    for (const fn of fileEntry.functionMetrics ?? []) {
      const cc = fn.cyclomaticComplexity ?? 0;
      if (cc >= 10) {
        highComplexFns.push({
          file: fileEntry.file,
          name: fn.name,
          complexity: cc,
          lines: fn.lines,
        });
      }
    }
  }
  highComplexFns.sort((a, b) => b.complexity - a.complexity);
  if (highComplexFns.length > 0) {
    lines.push(`HIGH-COMPLEXITY FUNCTIONS (cyclomatic ≥10, ${highComplexFns.length} total):`);
    for (const fn of highComplexFns.slice(0, 12)) {
      lines.push(`  ${fn.file} — ${fn.name} (complexity: ${fn.complexity}, ${fn.lines} lines)`);
    }
    if (highComplexFns.length > 12) {
      lines.push(`  … and ${highComplexFns.length - 12} more`);
    }
  }

  // ── Top contributors with detail ──────────────────────────────────────────
  if (report.contributors && report.contributors.length > 0) {
    lines.push("CONTRIBUTORS:");
    for (const c of report.contributors.slice(0, 5)) {
      lines.push(
        `  ${c.displayName}: ${c.commitCount} commits | test-coupling ${(c.testCoupling.pctCommitsTouchingTests * 100).toFixed(1)}% | refactor ratio ${(c.refactorBehavior.refactorCommitRatio * 100).toFixed(1)}%`,
      );
    }
  }

  // ── Framework ─────────────────────────────────────────────────────────────
  if (report.framework) {
    lines.push(
      `FRAMEWORK: ${report.framework.type} | React: ${report.framework.hasReact} | Backend: ${report.framework.hasBackend}`,
    );
  }

  return lines.join("\n");
}
