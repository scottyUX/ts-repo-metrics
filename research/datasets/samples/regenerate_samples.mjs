/**
 * Regenerate the pre/post-AI sample reports under analyzer_version 0.2.0.
 *
 * The committed samples were produced at analyzer_version 0.0.0 — before D1/D3/
 * D5/D9/D10 (0.1.0), before D7 and the D4 replacement (0.2.0), and before the
 * jscpd ignore-glob fix. Their Halstead volume, maintainabilityIndexGradAi*,
 * cognitiveComplexity and duplication figures are all stale.
 *
 * Each sample records its own source URL and commit, so every repository is
 * re-cloned and checked out at exactly the commit the existing report names.
 * Only the analyzer changes; the measured source does not.
 *
 * Usage: node regenerate_samples.mjs <scratchDir>
 */
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const SCRATCH = process.argv[2];
if (!SCRATCH) {
  console.error("usage: node regenerate_samples.mjs <scratchDir>");
  process.exit(2);
}

const { analyzeRepo } = await import(path.join(ROOT, "packages/engine/dist/index.js"));

await mkdir(SCRATCH, { recursive: true });

const results = [];
for (const bucket of ["pre_ai", "post_ai"]) {
  const dir = path.join(HERE, bucket);
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    const abs = path.join(dir, file);
    const prior = JSON.parse(await readFile(abs, "utf8"));
    const url = prior.source?.url;
    const commit = prior.source?.commit;
    const label = `${bucket}/${file}`;

    if (!url || !commit) {
      console.error(`  SKIP ${label}: no source url/commit recorded`);
      results.push({ label, status: "skipped", reason: "no source url/commit" });
      continue;
    }

    const clone = path.join(SCRATCH, file.replace(/\.json$/, ""));
    try {
      await execFileAsync("git", ["clone", "--quiet", url, clone], { timeout: 300_000 });
      await execFileAsync("git", ["-C", clone, "checkout", "--quiet", commit], {
        timeout: 120_000,
      });
    } catch (err) {
      const reason = (err?.stderr || err?.message || String(err)).trim().split("\n").pop();
      console.error(`  FAIL ${label}: clone/checkout — ${reason}`);
      results.push({ label, status: "failed", reason });
      continue;
    }

    try {
      const report = await analyzeRepo(clone);
      // Preserve the original source block: analyzing a local clone would
      // otherwise relabel a `git` source as `local` and drop the upstream URL.
      report.source = prior.source;
      await writeFile(abs, JSON.stringify(report, null, 2));
      console.error(
        `  OK   ${label.padEnd(52)} files=${String(report.filesAnalyzed).padStart(4)} ` +
          `fn=${String(report.totals.functions).padStart(5)} ` +
          `dup=${report.duplication?.percentage ?? "null"}% ` +
          `${prior.analyzer_version ?? "0.0.0"} -> ${report.analyzer_version}`,
      );
      results.push({
        label,
        status: "regenerated",
        files: report.filesAnalyzed,
        functions: report.totals.functions,
        from: prior.analyzer_version ?? "0.0.0",
        to: report.analyzer_version,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`  FAIL ${label}: analyze — ${reason}`);
      results.push({ label, status: "failed", reason });
    }
  }
}

const ok = results.filter((r) => r.status === "regenerated").length;
console.error(`\n${ok}/${results.length} samples regenerated`);
for (const r of results.filter((r) => r.status !== "regenerated")) {
  console.error(`  NOT REGENERATED: ${r.label} — ${r.reason}`);
}
