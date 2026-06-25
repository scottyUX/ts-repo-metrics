import type { RepoReport } from "./reportTypes";

/** True when the analyzed repo includes .tsx or .jsx files (React metrics apply). */
export function hasReactUiScope(report: RepoReport): boolean {
  const p = report.profile;
  return (p?.tsxFiles ?? 0) + (p?.jsxFiles ?? 0) > 0;
}
