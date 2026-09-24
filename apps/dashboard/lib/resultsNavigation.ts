/**
 * User-facing tab ids for the Results dashboard (kebab-case, not research instrument codes).
 */

export const RESULTS_TAB = {
  commitHabits: "commit-habits",
  testing: "testing",
  codeQuality: "code-quality",
  reactComponents: "react-components",
  codeComplexity: "code-complexity",
  aiUsage: "ai-usage",
  dataset: "dataset",
  documentation: "documentation",
} as const;

export type ResultsTabId = (typeof RESULTS_TAB)[keyof typeof RESULTS_TAB];

/** Tabs the global coach may point to (dataset + documentation excluded). */
export type CoachPriorityTabId = Exclude<
  ResultsTabId,
  typeof RESULTS_TAB.dataset | typeof RESULTS_TAB.documentation
>;

/** Scroll targets for in-page navigation from coach and overview cards. */
export const PANEL_SCROLL_IDS: Record<CoachPriorityTabId, string> = {
  [RESULTS_TAB.commitHabits]: "commit-habits-panel",
  [RESULTS_TAB.testing]: "testing-panel",
  [RESULTS_TAB.codeQuality]: "code-quality-panel",
  [RESULTS_TAB.reactComponents]: "react-components-panel",
  [RESULTS_TAB.codeComplexity]: "code-complexity-panel",
  [RESULTS_TAB.aiUsage]: "ai-usage-panel",
};

export function panelScrollIdForTab(tab: CoachPriorityTabId): string {
  return PANEL_SCROLL_IDS[tab];
}

/** In-page anchor id for a results tab panel (coach + overview links). */
export const panelScrollIdForCoachTab = panelScrollIdForTab;

/** Tab order and labels, as shown in the Results tab bar. */
export const RESULTS_TAB_ORDER: readonly { id: ResultsTabId; label: string }[] = [
  { id: RESULTS_TAB.commitHabits, label: "Commit Habits" },
  { id: RESULTS_TAB.testing, label: "Testing" },
  { id: RESULTS_TAB.codeQuality, label: "Code Quality" },
  { id: RESULTS_TAB.reactComponents, label: "React Components" },
  { id: RESULTS_TAB.codeComplexity, label: "Code Complexity" },
  { id: RESULTS_TAB.aiUsage, label: "AI Usage" },
  { id: RESULTS_TAB.documentation, label: "Documentation" },
  { id: RESULTS_TAB.dataset, label: "Dataset" },
];

/**
 * Tabs built from static analysis of source files. Hidden when `analysisSkipped` is set.
 * Code Complexity is not listed: it still runs on skipped repositories.
 */
const STATIC_ANALYSIS_TABS: ReadonlySet<ResultsTabId> = new Set([
  RESULTS_TAB.testing,
  RESULTS_TAB.codeQuality,
  RESULTS_TAB.reactComponents,
]);

export function isStaticAnalysisTab(tab: ResultsTabId): boolean {
  return STATIC_ANALYSIS_TABS.has(tab);
}

/** Tabs that have real data for this report, in tab-bar order. */
export function availableResultsTabs(opts: {
  analysisSkipped: boolean;
  showReact: boolean;
}): ResultsTabId[] {
  return RESULTS_TAB_ORDER.map((t) => t.id).filter((id) => {
    if (opts.analysisSkipped && isStaticAnalysisTab(id)) return false;
    if (!opts.showReact && id === RESULTS_TAB.reactComponents) return false;
    return true;
  });
}

/** "A, B, and C" from tab ids, using tab-bar labels. */
export function formatTabList(tabs: readonly ResultsTabId[]): string {
  const labels = RESULTS_TAB_ORDER.filter((t) => tabs.includes(t.id)).map((t) => t.label);
  if (labels.length <= 1) return labels.join("");
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
