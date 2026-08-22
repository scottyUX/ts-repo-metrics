import type { AnalyzeRef } from "@repo-metrics/engine";

export type RepoTargetPull = {
  number: number;
  title: string;
  state: "open" | "closed";
  headRef: string;
  baseRef: string;
};

export type RepoTargetBranch = {
  name: string;
};

export type RepoTargets = {
  defaultBranch: string;
  branches: RepoTargetBranch[];
  openPulls: RepoTargetPull[];
  closedPulls: RepoTargetPull[];
};

export type { AnalyzeRef };

export function parseAnalyzeRef(raw: unknown): AnalyzeRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.type === "pr") {
    const n = typeof r.prNumber === "number" ? r.prNumber : Number(r.prNumber);
    if (Number.isInteger(n) && n > 0) return { type: "pr", prNumber: n };
    return undefined;
  }
  if (r.type === "branch" && typeof r.branch === "string" && r.branch.trim()) {
    return { type: "branch", branch: r.branch.trim() };
  }
  if (r.type === "default") return { type: "default" };
  return undefined;
}
