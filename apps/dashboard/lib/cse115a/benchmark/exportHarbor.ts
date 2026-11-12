import { isExportable, type ExportCandidate } from "./exportJsonl";
import { buildHarborTask, harborSkipReason, harborTaskName, type HarborSource } from "./validation/harbor";

// The instructor Harbor export: the rows the JSONL export returns with ?validated=1 (same consent and
// status rule, same isExportable), each as a Harbor task folder whose image fetches the base commit
// from GitHub. Rows Harbor cannot express yet, and rows whose repository the batch found private
// (harbor_env.repo_public === false; nobody outside can fetch it), are left out and listed, with the
// reason, in SKIPPED.txt at the root. Pure, so it is tested without HTTP or a database; the route zips the files.

export type HarborExportSkip = { instance_id: string; reason: string };

export type HarborExport = {
  /** Zip path → contents, task folders first (sorted by instance id), then SKIPPED.txt when anything was skipped. */
  files: Map<string, string>;
  /** Instance ids exported, sorted. */
  exported: string[];
  skipped: HarborExportSkip[];
};

/** Rows validated before harbor_env existed, or written back from a result file without one. */
export const NO_RECIPE_REASON = "no Harbor recipe (harbor_env) on the row; re-run the validator on it and write back";

const SOURCE: HarborSource = { kind: "github" };

export function harborExport(candidates: ExportCandidate[]): HarborExport {
  const out: HarborExport = { files: new Map(), exported: [], skipped: [] };
  const rows = candidates
    .filter((candidate) => isExportable(candidate, { validatedOnly: true }))
    .map((candidate) => candidate.instance)
    .sort((a, b) => a.instance_id.localeCompare(b.instance_id));
  for (const instance of rows) {
    const env = instance.harbor_env ?? null;
    const reason = env ? harborSkipReason(env, instance, SOURCE) : NO_RECIPE_REASON;
    if (reason || !env) {
      out.skipped.push({ instance_id: instance.instance_id, reason: reason ?? NO_RECIPE_REASON });
      continue;
    }
    const name = harborTaskName(instance.instance_id);
    for (const [path, contents] of buildHarborTask({ row: instance, env, source: SOURCE, name })) out.files.set(`${name}/${path}`, contents);
    out.exported.push(instance.instance_id);
  }
  if (out.skipped.length) {
    out.files.set("SKIPPED.txt", [
      "# Validated, consented rows left out of this export, with the reason.",
      ...out.skipped.map((s) => `${s.instance_id}\t${s.reason}`),
      "",
    ].join("\n"));
  }
  return out;
}
