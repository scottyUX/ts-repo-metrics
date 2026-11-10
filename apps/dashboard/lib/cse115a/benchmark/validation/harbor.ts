// Builds a Harbor task directory (docs.harborframework.com) from a validated row: instruction.md,
// task.toml, environment/Dockerfile, solution/solve.sh, tests/test.sh plus the files they need. Pure:
// returns path → contents; the script writes them and copies the snapshot bundle next to the
// Dockerfile, so the task builds without reaching GitHub. The verifier applies the test patch, runs
// the same test steps the validator ran, and writes reward 1 only if every verified FAIL_TO_PASS,
// ABSENT_TO_PASS and PASS_TO_PASS id passed — the SWE-bench grading rule.
// task.toml keys follow the Harbor task configuration page; check them against the current docs
// before publishing a dataset.

import { CONTAINER_ENV, type Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { NODE_TEST_REPORTER_SOURCE } from "@/lib/cse115a/benchmark/validation/nodeTestReporter";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

export type HarborRow = TaskRow & { problem_statement?: string; hints_text?: string; difficulty?: string | null; created_at?: string | null };

export type HarborInput = {
  row: HarborRow;
  result: ValidationResult;
  env: Environment;
  /** File name of the snapshot bundle copied into environment/ (e.g. repo.bundle). */
  bundleFile: string;
  /** Harbor task name; defaults to the instance id lower-cased with safe characters. */
  name?: string;
  author?: { name: string; email?: string };
};

/** `CSE115a-PocketWatch__PocketWatch-logout-all-1` → `cse115a-pocketwatch__pocketwatch-logout-all-1`. */
export function harborTaskName(instanceId: string): string {
  return instanceId.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
}

const toml = (value: string) => JSON.stringify(value);

/**
 * Dockerfile line that throws away the cloned history and re-creates the checkout as a single
 * commit with a fixed author and message. Exported so the test and the docs can quote it.
 */
export const GIT_REINIT_LAYER =
  "RUN cd /app && rm -rf .git && git init -q && git -c user.name=hecate -c user.email=hecate@localhost add -A" +
  " && git -c user.name=hecate -c user.email=hecate@localhost commit -qm base";

/**
 * Why a row cannot be exported yet, or null. The verifier's check.mjs runs on Node and the task
 * image for a pytest row is a Python one, so pytest rows are skipped until a Python verifier exists.
 */
export function harborSkipReason(env: Environment): string | null {
  return env.runners.includes("pytest") ? "Harbor export for pytest rows is not built yet" : null;
}

export function buildHarborTask(input: HarborInput): Map<string, string> {
  const { row, result, env } = input;
  const skip = harborSkipReason(env);
  if (skip) throw new Error(skip);
  const name = input.name ?? harborTaskName(row.instance_id);
  const files = new Map<string, string>();
  const expected = {
    FAIL_TO_PASS: [...result.FAIL_TO_PASS, ...result.ABSENT_TO_PASS],
    PASS_TO_PASS: result.PASS_TO_PASS,
  };
  const envLines = Object.entries({ ...CONTAINER_ENV, ...env.env }).map(([k, v]) => `ENV ${k}=${v}`);
  const sub = (dir: string) => (dir ? `cd /app/${dir}` : "cd /app");

  files.set("instruction.md", [
    row.problem_statement?.trim() || `# ${row.instance_id}\n\n(No task description was captured.)`,
    "",
    ...(row.hints_text?.trim() ? ["## Hints", "", row.hints_text.trim(), ""] : []),
    "## Repository",
    "",
    `The repository is checked out at \`/app\` at commit \`${row.base_commit}\` of \`${row.repo}\`, with dependencies installed.`,
    "Make the change described above. Tests that exercise it will be run afterwards; do not modify or delete existing tests.",
    "",
  ].join("\n"));

  files.set("task.toml", [
    `version = "1.0"`,
    "",
    "[metadata]",
    `author_name = ${toml(input.author?.name ?? "Hecate (UCSC CSE 115A)")}`,
    ...(input.author?.email ? [`author_email = ${toml(input.author.email)}`] : []),
    `difficulty = ${toml(row.difficulty ?? "medium")}`,
    `category = "software-engineering"`,
    `tags = ["hecate", "cse115a", "typescript", ${toml(env.runners.join("+"))}]`,
    `instance_id = ${toml(row.instance_id)}`,
    `repo = ${toml(row.repo)}`,
    `base_commit = ${toml(row.base_commit)}`,
    ...(row.created_at ? [`created_at = ${toml(row.created_at)}`] : []),
    "",
    "[verifier]",
    "timeout_sec = 900.0",
    "",
    "[agent]",
    "timeout_sec = 1800.0",
    "",
    "[environment]",
    "build_timeout_sec = 1800.0",
    "cpus = 2",
    "memory_mb = 4096",
    "storage_mb = 10240",
    "",
  ].join("\n"));

  files.set("environment/Dockerfile", [
    `FROM ${result.image_digest ?? env.image}`,
    ...envLines,
    "WORKDIR /app",
    `COPY ${input.bundleFile} /tmp/repo.bundle`,
    `RUN git clone -q -b hecate-snapshot /tmp/repo.bundle /app && rm /tmp/repo.bundle && git -C /app checkout -q ${row.base_commit} && git -C /app branch -D hecate-snapshot`,
    // The bundle holds only what the base commit reaches (the fix is never in it), but the history
    // before base is still a hint channel: commit messages, author names, the remote's branch names.
    // Replace it with one anonymous commit, so the agent sees the files and nothing else, while
    // solve.sh and test.sh can still `git apply` against a repository.
    GIT_REINIT_LAYER,
    `RUN ${sub(env.installDir)} && ${env.installCommand}`,
    "",
  ].join("\n"));

  files.set("solution/solve.sh", [
    "#!/bin/bash",
    "# Oracle: apply the reference fix (the student's patch).",
    "set -e",
    "cd /app",
    "git apply --whitespace=nowarn /solution/fix.diff",
    "",
  ].join("\n"));
  files.set("solution/fix.diff", row.patch);

  files.set("tests/test.sh", [
    "#!/bin/bash",
    "# Verifier: add the task's tests, run the suite the way the validator did, grade against expected.json.",
    "mkdir -p /logs/verifier",
    "cd /app",
    "git apply --whitespace=nowarn /tests/test.diff || { echo 'test patch did not apply' >&2; echo 0 > /logs/verifier/reward.txt; exit 0; }",
    `${sub(env.installDir)} && (${env.installCommand}) || true`,
    "mkdir -p /tests/reports",
    "export REPORT_DIR=/tests/reports",
    sub(env.packageDir),
    ...env.testSteps.map((step) => `${step.command.replace("/patches/reporter.mjs", "/tests/reporter.mjs")} || true`),
    "node /tests/check.mjs /tests/expected.json /tests/reports /app/ /logs/verifier/reward.txt > /logs/verifier/summary.txt 2>&1",
    "cat /logs/verifier/summary.txt",
    "",
  ].join("\n"));
  files.set("tests/test.diff", row.test_patch);
  files.set("tests/expected.json", JSON.stringify(expected, null, 2) + "\n");
  files.set("tests/reporter.mjs", NODE_TEST_REPORTER_SOURCE);
  files.set("tests/check.mjs", CHECK_SOURCE);
  files.set("tests/README.md", [
    `# ${name}`,
    "",
    `Harbor task built from Hecate instance \`${row.instance_id}\` (${row.repo} @ ${row.base_commit}).`,
    "",
    `Verified by the Hecate validator: ${expected.FAIL_TO_PASS.length} fail-to-pass, ${expected.PASS_TO_PASS.length} pass-to-pass` +
      (result.flaky.length ? `, ${result.flaky.length} flaky test(s) excluded` : "") + ".",
    "Reward is 1 only if every id in expected.json passes after the agent's change; the same rule the SWE-bench harness applies.",
    "",
  ].join("\n"));
  return files;
}

/**
 * Source of tests/check.mjs: merges the run's reports (Vitest or Jest JSON, and the node --test reporter's JSON)
 * into test id → status, strips the mount prefix, and writes reward 1 to the given file iff every
 * expected id passed.
 * Plain Node, no dependencies, because it runs inside the task image.
 */
export const CHECK_SOURCE = `import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const [expectedFile, reportDir, prefix, rewardFile] = process.argv.slice(2);
const expected = JSON.parse(readFileSync(expectedFile, "utf8"));
const results = {};
const strip = (id) => (id.startsWith(prefix) ? id.slice(prefix.length) : id);

let names = [];
try { names = readdirSync(reportDir).filter((n) => n.endsWith(".json")).sort(); } catch {}
for (const name of names) {
  const report = JSON.parse(readFileSync(join(reportDir, name), "utf8"));
  if (name.startsWith("node-")) {
    for (const [id, status] of Object.entries(report)) results[strip(id)] = status;
  } else {
    for (const file of report.testResults ?? []) {
      const path = strip(file.name ?? "");
      for (const t of file.assertionResults ?? []) {
        const id = path + "::" + [...(t.ancestorTitles ?? []), t.title].join(" > ");
        results[id] = t.status === "passed" || t.status === "focused" ? "passed" : t.status === "failed" ? "failed" : "skipped";
      }
    }
  }
}

const graded = [...expected.FAIL_TO_PASS.map((id) => ["FAIL_TO_PASS", id]), ...expected.PASS_TO_PASS.map((id) => ["PASS_TO_PASS", id])];
const failures = graded.filter(([, id]) => results[id] !== "passed");
for (const [list, id] of failures) console.log(\`\${list} not passed: \${id} (\${results[id] ?? "absent"})\`);
console.log(\`\${graded.length - failures.length}/\${graded.length} expected tests passed\`);
mkdirSync(dirname(rewardFile), { recursive: true });
writeFileSync(rewardFile, failures.length === 0 ? "1\\n" : "0\\n");
`;
