import type { RepoReport } from "@/lib/reportTypes";

export function isPrScopedReport(report: RepoReport): boolean {
  return report.source?.scope === "pr";
}

export function analysisTeamOptionLabel(report: RepoReport): string {
  return isPrScopedReport(report)
    ? "This pull request (all authors)"
    : "Whole repository (team)";
}

export function analysisCorpusNoun(report: RepoReport): string {
  return isPrScopedReport(report) ? "this pull request" : "the whole repository";
}
