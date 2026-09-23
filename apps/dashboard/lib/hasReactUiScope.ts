import type { RepoReport } from "./reportTypes";

/** True when the run includes JSX/TSX files or any JSX-bearing component. */
export function hasReactUiScope(report: RepoReport): boolean {
  const jsxLike =
    (report.profile?.tsxFiles ?? 0) + (report.profile?.jsxFiles ?? 0);
  return jsxLike > 0 || (report.reactMetrics?.summary.componentsAnalyzed ?? 0) > 0;
}
