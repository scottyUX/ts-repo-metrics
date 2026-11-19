// The repo census: what does each Sprint repository need to run its tests? Clones each repository
// once (reusing a batch's repos/ folder when given), reads package.json, CI workflows and the test
// files at base + both patches, and prints a Markdown table plus counts. No Docker, no database.
//
//   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/benchmarkRepoCensus.ts ROWS.json --repos DIR [--out census.md]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseRows } from "@/lib/cse115a/benchmark/validation/batch";
import { censusMarkdown, signals, type CensusEntry } from "@/lib/cse115a/benchmark/validation/census";
import { detectEnvironment } from "@/lib/cse115a/benchmark/validation/environment";
import { cloneRepo, ensureCommit, fileIn, packageJsonFiles, signalsPackageJson, withPatchedWorktree, workflowFiles } from "@/lib/cse115a/benchmark/validation/runRow";
import { filesInPatch } from "@/lib/cse115a/benchmark/validation/validateTask";

function parseArgs(argv: string[]) {
  const args = { rowsPath: "", repos: "", out: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repos") args.repos = argv[++i] ?? "";
    else if (arg === "--out") args.out = argv[++i] ?? "";
    else if (!args.rowsPath) args.rowsPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.rowsPath || !args.repos) throw new Error("Usage: benchmarkRepoCensus.ts ROWS.json --repos DIR [--out census.md]");
  return args;
}

async function exists(path: string): Promise<boolean> {
  try { await readFile(path); return true; } catch { return false; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reposDir = resolve(args.repos);
  await mkdir(reposDir, { recursive: true });
  const rows = parseRows(await readFile(args.rowsPath, "utf8"));
  const log = (line: string) => console.error(line);
  const entries: CensusEntry[] = [];

  for (const row of rows) {
    const repoDir = join(reposDir, row.repo.replace("/", "__"));
    let note = "";
    try {
      if (!(await exists(join(repoDir, ".git", "HEAD")))) await cloneRepo(row.repo, repoDir, log);
      await ensureCommit(repoDir, row.base_commit, log, row.repo);
      const testFiles = filesInPatch(row.test_patch);
      const inspect = async (dir: string) => {
        const workflowNames = await workflowFiles(dir);
        const env = await detectEnvironment({ testFiles, read: (path) => fileIn(dir, path), workflowFiles: workflowNames, packageJsonFiles: await packageJsonFiles(dir) });
        const workflows = (await Promise.all(workflowNames.map((n) => fileIn(dir, n)))).join("\n");
        const testSources = (await Promise.all(testFiles.map((f) => fileIn(dir, f)))).join("\n");
        const packageJson = await signalsPackageJson(dir, env);
        return { instance_id: row.instance_id, repo: row.repo, env, signals: signals({ packageJson, workflows, testSources }), note };
      };
      let entry: CensusEntry;
      try {
        entry = await withPatchedWorktree(repoDir, row.base_commit, [row.test_patch, row.patch], inspect);
      } catch {
        // The patches did not apply (bad capture, stacked PR): the repository can still be inspected at base.
        note = "patches did not apply; inspected base";
        entry = await withPatchedWorktree(repoDir, row.base_commit, [], inspect);
      }
      entries.push(entry);
    } catch (error) {
      note = error instanceof Error ? error.message.split("\n")[0] : String(error);
      entries.push({ instance_id: row.instance_id, repo: row.repo, env: { supported: false, reason: "env_unsupported", detail: "could not inspect" }, signals: { database: [], browser: [], otherRunners: [] }, note });
    }
    log(`${row.instance_id}: done`);
  }
  const md = censusMarkdown(entries);
  if (args.out) await writeFile(args.out, md);
  console.log(md);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
