// Builds a Harbor task directory (docs.harborframework.com) from a validated row: instruction.md,
// task.toml, environment/Dockerfile, solution/solve.sh, tests/test.sh plus the files they need. Pure:
// returns path → contents. The repository comes from one of two sources: "bundle" (the batch's
// snapshot bundle, which the script copies next to the Dockerfile, so the task builds without
// reaching GitHub) or "github" (the image fetches the base commit from the public repository; the
// course website's zip export uses it, since the database holds no bundles). The verifier applies the
// test patch, runs the same test steps the validator ran, and writes reward 1 only if every verified
// FAIL_TO_PASS, ABSENT_TO_PASS and PASS_TO_PASS id passed — the SWE-bench grading rule.
// The environment comes from the row's recipe (HarborEnv, stored on the row as harbor_env by the
// write-back), so a task can be built from a database row alone.
// task.toml keys follow the Harbor task configuration page; check them against the current docs
// before publishing a dataset.

import { CONTAINER_ENV, installPlan, PYTEST_REPORTER_FILE, type Environment, type NodeSource, type Runner, type TestStep } from "@/lib/cse115a/benchmark/validation/environment";
import { NODE_TEST_REPORTER_SOURCE } from "@/lib/cse115a/benchmark/validation/nodeTestReporter";
import { PYTEST_REPORTER_MODULE, PYTEST_REPORTER_SOURCE } from "@/lib/cse115a/benchmark/validation/pytestReporter";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

/**
 * The Harbor recipe: everything buildHarborTask needs besides the row itself. Stored on the row as
 * `cse_benchmark_tasks.harbor_env` (jsonb) and carried on the validator's result. No secrets: the
 * container variables are the validator's placeholders (or values from the repository's own CI
 * file), and a database service is recorded by name and image only.
 */
export type HarborEnv = {
  /** The image the validator ran: `tag@sha256:…` when the batch resolved the digest, else the tag. */
  image: string;
  runners: Runner[];
  /** Where the tests run, relative to the checkout ("" is the root). */
  package_dir: string;
  /** The installs, in order: `cwd` relative to the checkout, `command` as run there. */
  install_steps: Array<{ cwd: string; command: string }>;
  /** The test phase as the validator ran it (reporter paths under /patches; the builder moves them). */
  test_steps: TestStep[];
  /** Container variables on top of CONTAINER_ENV. */
  env: Record<string, string>;
  /** Database containers the runs had; a row with any is not exported yet. */
  services: Array<{ name: string; image: string }>;
  /** Where the Node version came from (JavaScript); null for Python, whose version is in the image tag. */
  node_source: NodeSource | null;
};

/** The recipe for an environment the validator ran, with the image digest when the batch knows it. */
export function harborEnvFrom(env: Environment, imageDigest?: string | null): HarborEnv {
  return {
    image: imageDigest ?? env.image,
    runners: [...env.runners],
    package_dir: env.packageDir,
    install_steps: installPlan(env).map((step) => ({ cwd: step.cwd, command: step.command })),
    test_steps: env.testSteps.map((step) => ({ ...step })),
    env: { ...env.env },
    services: (env.services ?? []).map((s) => ({ name: s.name, image: s.image })),
    node_source: env.nodeSource ?? null,
  };
}

export type HarborRow = TaskRow & { problem_statement?: string; hints_text?: string; difficulty?: string | null; created_at?: string | null };

/** Where the image gets the repository from. */
export type HarborSource = { kind: "bundle"; file: string } | { kind: "github" };

export type HarborInput = {
  /** FAIL_TO_PASS and PASS_TO_PASS are the verified lists (ABSENT_TO_PASS folded in), as write-back stores them. */
  row: HarborRow;
  env: HarborEnv;
  source: HarborSource;
  /** How many flaky tests the validator excluded; tests/README.md mentions it when known. */
  flakyCount?: number;
  /** Harbor task name; defaults to the instance id lower-cased with safe characters. */
  name?: string;
  author?: { name: string; email?: string };
};

/** A batch row with the result's verified lists, the way the database stores it after write-back. */
export function verifiedRow<T extends TaskRow>(row: T, result: ValidationResult): T {
  return { ...row, FAIL_TO_PASS: [...result.FAIL_TO_PASS, ...result.ABSENT_TO_PASS], PASS_TO_PASS: result.PASS_TO_PASS };
}

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

const GITHUB_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * The one Dockerfile line that fetches only the base commit from GitHub and checks it out in /app.
 * One RUN, so nothing past the base commit is ever in a layer; fetching by id works for a commit no
 * branch points at.
 */
export function githubFetchLayer(repo: string, baseCommit: string): string {
  return `RUN git init -q /app && git -C /app fetch -q --depth 1 https://github.com/${repo}.git ${baseCommit} && git -C /app checkout -q FETCH_HEAD`;
}

/**
 * Why a row cannot be exported yet, or null. A row whose runs had a database container is skipped:
 * a Harbor task has one image, no sidecar. With the github source, the repository and commit go into
 * a Dockerfile line, so they must be an `owner/name` and a full commit id (GitHub fetches no short ids).
 */
export function harborSkipReason(env: HarborEnv, row?: Pick<TaskRow, "repo" | "base_commit">, source?: HarborSource): string | null {
  if (env.services?.length) return "Harbor export for rows with a database service is not built yet";
  if (row && source?.kind === "github") {
    if (!GITHUB_REPO.test(row.repo)) return `repo ${JSON.stringify(row.repo)} is not a GitHub owner/name`;
    if (!FULL_SHA.test(row.base_commit)) return `base_commit ${JSON.stringify(row.base_commit)} is not a full commit id`;
  }
  return null;
}

/**
 * Where the pytest reporter plugin sits in a Python task: its own folder, put on PYTHONPATH, so
 * nothing else in /tests (check.py) can shadow a module of the repository under test.
 */
export const PYTEST_PLUGIN_DIR = "/tests/pytest_plugin";

export function buildHarborTask(input: HarborInput): Map<string, string> {
  const { row, env, source } = input;
  const skip = harborSkipReason(env, row, source);
  if (skip) throw new Error(skip);
  const name = input.name ?? harborTaskName(row.instance_id);
  const python = env.runners.includes("pytest");
  const files = new Map<string, string>();
  const expected = { FAIL_TO_PASS: row.FAIL_TO_PASS, PASS_TO_PASS: row.PASS_TO_PASS };
  const envLines = Object.entries({ ...CONTAINER_ENV, ...env.env }).map(([k, v]) => `ENV ${k}=${v}`);
  const sub = (dir: string) => (dir ? `cd /app/${dir}` : "cd /app");
  const checkout = source.kind === "bundle"
    ? [
        `COPY ${source.file} /tmp/repo.bundle`,
        `RUN git clone -q -b hecate-snapshot /tmp/repo.bundle /app && rm /tmp/repo.bundle && git -C /app checkout -q ${row.base_commit} && git -C /app branch -D hecate-snapshot`,
      ]
    : [githubFetchLayer(row.repo, row.base_commit)];

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
    `tags = ["hecate", "cse115a", ${toml(python ? "python" : "typescript")}, ${toml(env.runners.join("+"))}]`,
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
    `FROM ${env.image}`,
    ...envLines,
    "WORKDIR /app",
    ...checkout,
    // The checkout holds only what the base commit reaches (the fix is never in it), but the history
    // before base is still a hint channel: commit messages, author names, the remote's branch names.
    // Replace it with one anonymous commit, so the agent sees the files and nothing else, while
    // solve.sh and test.sh can still `git apply` against a repository.
    GIT_REINIT_LAYER,
    ...env.install_steps.map((step) => `RUN ${sub(step.cwd)} && ${step.command}`),
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

  // The validator's reporters live in /patches; the task ships them in /tests.
  const pytestDir = PYTEST_REPORTER_FILE.slice(0, PYTEST_REPORTER_FILE.lastIndexOf("/"));
  const testCommand = (command: string) => python
    ? command.replace(`PYTHONPATH=${pytestDir} `, `PYTHONPATH=${PYTEST_PLUGIN_DIR} `)
    : command.replace("/patches/reporter.mjs", "/tests/reporter.mjs");
  const check = python ? "python3 /tests/check.py" : "node /tests/check.mjs";
  files.set("tests/test.sh", [
    "#!/bin/bash",
    "# Verifier: add the task's tests, run the suite the way the validator did, grade against expected.json.",
    "mkdir -p /logs/verifier",
    "cd /app",
    "git apply --whitespace=nowarn /tests/test.diff || { echo 'test patch did not apply' >&2; echo 0 > /logs/verifier/reward.txt; exit 0; }",
    ...env.install_steps.map((step) => `${sub(step.cwd)} && (${step.command}) || true`),
    "mkdir -p /tests/reports",
    "export REPORT_DIR=/tests/reports",
    sub(env.package_dir),
    ...env.test_steps.map((step) => `${testCommand(step.command)} || true`),
    `${check} /tests/expected.json /tests/reports /app/ /logs/verifier/reward.txt > /logs/verifier/summary.txt 2>&1`,
    "cat /logs/verifier/summary.txt",
    "",
  ].join("\n"));
  files.set("tests/test.diff", row.test_patch);
  files.set("tests/expected.json", JSON.stringify(expected, null, 2) + "\n");
  if (python) {
    files.set(`${PYTEST_PLUGIN_DIR.slice(1)}/${PYTEST_REPORTER_MODULE}.py`, PYTEST_REPORTER_SOURCE);
    files.set("tests/check.py", CHECK_PY_SOURCE);
  } else {
    files.set("tests/reporter.mjs", NODE_TEST_REPORTER_SOURCE);
    files.set("tests/check.mjs", CHECK_SOURCE);
  }
  files.set("tests/README.md", [
    `# ${name}`,
    "",
    `Harbor task built from Hecate instance \`${row.instance_id}\` (${row.repo} @ ${row.base_commit}).`,
    "",
    `Verified by the Hecate validator: ${expected.FAIL_TO_PASS.length} fail-to-pass, ${expected.PASS_TO_PASS.length} pass-to-pass` +
      (input.flakyCount ? `, ${input.flakyCount} flaky test(s) excluded` : "") + ".",
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

/**
 * Source of tests/check.py: the Python port of CHECK_SOURCE for pytest tasks, whose image has no
 * Node. Same arguments (expected.json, report dir, mount prefix, reward file) and the same reward
 * rule. Reads the pytest reporter's flat {id: status} JSON (pytest-*.json) as well as the formats
 * check.mjs reads. Standard library only.
 */
export const CHECK_PY_SOURCE = String.raw`"""Hecate Harbor verifier: writes reward 1 iff every expected test passed. Generated; see harbor.ts."""
import json
import os
import sys

expected_file, report_dir, prefix, reward_file = sys.argv[1:5]
with open(expected_file, encoding="utf-8") as f:
    expected = json.load(f)
results = {}


def strip(test_id):
    return test_id[len(prefix):] if test_id.startswith(prefix) else test_id


def text(value):
    return "" if value is None else str(value)


try:
    names = sorted(n for n in os.listdir(report_dir) if n.endswith(".json"))
except OSError:
    names = []
for name in names:
    with open(os.path.join(report_dir, name), encoding="utf-8") as f:
        report = json.load(f)
    if name.startswith("node-") or name.startswith("pytest-"):
        for test_id, status in report.items():
            results[strip(test_id)] = status
    else:
        for file in report.get("testResults") or []:
            path = strip(file.get("name") or "")
            for t in file.get("assertionResults") or []:
                test_id = path + "::" + " > ".join(text(p) for p in [*(t.get("ancestorTitles") or []), t.get("title")])
                status = t.get("status")
                results[test_id] = "passed" if status in ("passed", "focused") else "failed" if status == "failed" else "skipped"

graded = [("FAIL_TO_PASS", i) for i in expected["FAIL_TO_PASS"]] + [("PASS_TO_PASS", i) for i in expected["PASS_TO_PASS"]]
failures = [(lst, i) for lst, i in graded if results.get(i) != "passed"]
for lst, i in failures:
    status = results.get(i)
    print(lst + " not passed: " + i + " (" + ("absent" if status is None else text(status)) + ")")
print(str(len(graded) - len(failures)) + "/" + str(len(graded)) + " expected tests passed")
os.makedirs(os.path.dirname(reward_file) or ".", exist_ok=True)
with open(reward_file, "w", encoding="utf-8") as f:
    f.write("1\n" if not failures else "0\n")
`;
