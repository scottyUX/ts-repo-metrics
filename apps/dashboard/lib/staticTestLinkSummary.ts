import type { SymbolVerificationRisk } from "@/lib/reportTypes";

export type StaticTestLinkSummary = {
  total: number;
  referencedInTest: number;
  pairedFileOnly: number;
  none: number;
  /** Functions with any static link (referenced or paired file). */
  withSignal: number;
  /** Of those, how many link to a test file changed in this PR. Null on repo-scoped reports. */
  withSignalInPr: number | null;
};

/**
 * Counts static test links for the "Functions with static test link" card. The static scan pairs each
 * function with a test file anywhere in the repository, so on a PR report it also counts how many of
 * those paired tests are in the PR itself (#286). `changedFiles` is the PR's changed file list.
 */
export function summarizeStaticTestLinks(
  rows: readonly SymbolVerificationRisk[],
  changedFiles: readonly string[] | null | undefined,
): StaticTestLinkSummary | null {
  if (!rows.length) return null;
  const changed = changedFiles ? new Set(changedFiles) : null;
  let referencedInTest = 0;
  let pairedFileOnly = 0;
  let none = 0;
  let withSignalInPr = 0;
  for (const row of rows) {
    if (row.evidence === "referenced_in_test") referencedInTest++;
    else if (row.evidence === "paired_file_only") pairedFileOnly++;
    else none++;
    if (changed && row.evidence !== "none" && row.pairedTestPath && changed.has(row.pairedTestPath)) withSignalInPr++;
  }
  return {
    total: rows.length,
    referencedInTest,
    pairedFileOnly,
    none,
    withSignal: referencedInTest + pairedFileOnly,
    withSignalInPr: changed ? withSignalInPr : null,
  };
}