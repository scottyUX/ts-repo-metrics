/**
 * Result IDs for persisted analyses.
 * Default-branch runs keep `{owner}-{repo}-{sha12}`.
 * PR and named-branch runs add a prefix so they do not overwrite that row.
 */

import { randomUUID } from "node:crypto";
import type { AnalyzeRef } from "@/lib/github/analyzeRef";

function sanitizeRefForKey(ref: string): string {
  const cleaned = ref
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || "ref";
}

export function buildAnalysisResultId(opts: {
  owner: string;
  repo: string;
  commitSha?: string | null;
  ref?: AnalyzeRef | null;
  /** From the report when a PR URL was inferred without an explicit ref. */
  prNumber?: number | null;
  scope?: "repo" | "pr";
}): string {
  const suffix = opts.commitSha
    ? opts.commitSha.slice(0, 12)
    : randomUUID().replace(/-/g, "").slice(0, 12);

  const prNumber =
    opts.ref?.type === "pr"
      ? opts.ref.prNumber
      : opts.scope === "pr"
        ? opts.prNumber
        : null;
  if (prNumber) {
    return `${opts.owner}-${opts.repo}-pr${prNumber}-${suffix}`;
  }

  if (opts.ref?.type === "branch") {
    return `${opts.owner}-${opts.repo}-${sanitizeRefForKey(opts.ref.branch)}-${suffix}`;
  }

  return `${opts.owner}-${opts.repo}-${suffix}`;
}
