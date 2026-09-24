import { SWE_BENCH_FIELDS, type BenchmarkInstance } from "./buildInstance";

// SWE-bench JSONL, shaped like the Hugging Face dataset: FAIL_TO_PASS and
// PASS_TO_PASS are JSON-encoded strings and created_at is an ISO string.

export type ExportCandidate = {
  instance: BenchmarkInstance;
  /** One entry per student who submitted this instance. */
  sources: Array<{ consented: boolean; validationStatus: "candidate" | "validated" | "rejected" }>;
};

/** An instance is exported when it was not rejected and a student who submitted it has consented. */
export function isExportable(candidate: ExportCandidate, options: { validatedOnly?: boolean } = {}): boolean {
  if (candidate.sources.some((source) => source.validationStatus === "rejected")) return false;
  if (options.validatedOnly && !candidate.sources.some((source) => source.validationStatus === "validated")) return false;
  return candidate.sources.some((source) => source.consented);
}

// Repo Metrics reports carry per-author activity (keyed by email), GitHub
// logins, and submission metadata. The export keeps repository-level metrics only.
const PERSONAL_KEYS = new Set([
  "contributors", "_submission", "authorEmail", "authorName", "displayName", "email",
  "login", "github_login", "githubLogin", "avatarUrl", "htmlUrl", "team_name",
]);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function redactPersonalData(value: unknown): unknown {
  if (typeof value === "string") return value.replace(EMAIL, "[redacted]");
  if (Array.isArray(value)) return value.map(redactPersonalData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !PERSONAL_KEYS.has(key))
      .map(([key, item]) => [key, redactPersonalData(item)]));
  }
  return value;
}

export function toJsonlRecord(instance: BenchmarkInstance): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of SWE_BENCH_FIELDS) {
    const value = instance[field];
    if (field === "FAIL_TO_PASS" || field === "PASS_TO_PASS") record[field] = JSON.stringify(value ?? []);
    else if (field === "created_at") record[field] = value ? new Date(value as string).toISOString() : null;
    else if (field === "repo_metrics") record[field] = redactPersonalData(value ?? null);
    else record[field] = value ?? null;
  }
  return record;
}

export function exportJsonl(candidates: ExportCandidate[], options: { validatedOnly?: boolean } = {}): string {
  return candidates
    .filter((candidate) => isExportable(candidate, options))
    .sort((a, b) => a.instance.instance_id.localeCompare(b.instance.instance_id))
    .map((candidate) => `${JSON.stringify(toJsonlRecord(candidate.instance))}\n`)
    .join("");
}
