import { describe, expect, it } from "vitest";
import type { Environment } from "@/lib/cse115a/benchmark/validation/environment";
import { buildHarborTask, harborTaskName } from "@/lib/cse115a/benchmark/validation/harbor";
import { rejectedWithoutRun } from "@/lib/cse115a/benchmark/validation/batch";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const row: TaskRow & { problem_statement: string; hints_text: string } = {
  instance_id: "CSE115a-PocketWatch__PocketWatch-logout-all-1", repo: "CSE115a-PocketWatch/PocketWatch", base_commit: "28e92a1",
  patch: "diff --git a/src/a.ts b/src/a.ts\n", test_patch: "diff --git a/tests/a.test.mjs b/tests/a.test.mjs\n",
  FAIL_TO_PASS: [], PASS_TO_PASS: [], problem_statement: "# logout-all-1\n\nLog out of every session.", hints_text: "",
};
const env: Environment = {
  supported: true, runners: ["node-test"], packageManager: "pnpm", packageDir: "apps/api", installDir: "",
  installCommand: "corepack enable && pnpm install --frozen-lockfile",
  testSteps: [{ kind: "prep", command: "pnpm build" }, { kind: "node-test", command: "REPORT=$REPORT_DIR/node-1.json node --test --test-reporter=/patches/reporter.mjs tests/*.test.mjs" }],
  env: { CI: "true" }, dockerfile: "", image: "node:24-bookworm",
};
const result: ValidationResult = {
  ...rejectedWithoutRun(row, "env_error", ""), validation_status: "validated", reason: null, detail: null,
  FAIL_TO_PASS: ["apps/api/tests/a.test.mjs::one"], ABSENT_TO_PASS: ["apps/api/tests/a.test.mjs::two"], PASS_TO_PASS: ["apps/api/tests/old.test.mjs::three"],
  image: "node:24-bookworm", image_digest: "node@sha256:8fa9", snapshot_bundle: "snapshots/x.bundle",
};

describe("buildHarborTask", () => {
  const files = buildHarborTask({ row, result, env, bundleFile: "repo.bundle" });

  it("writes the five Harbor parts plus the files the verifier needs", () => {
    expect([...files.keys()].sort()).toEqual([
      "environment/Dockerfile", "instruction.md", "solution/fix.diff", "solution/solve.sh", "task.toml",
      "tests/README.md", "tests/check.mjs", "tests/expected.json", "tests/reporter.mjs", "tests/test.diff", "tests/test.sh",
    ]);
  });

  it("builds the image from the digest and the bundle, and installs where the validator did", () => {
    const dockerfile = files.get("environment/Dockerfile")!;
    expect(dockerfile).toContain("FROM node@sha256:8fa9");
    expect(dockerfile).toContain("git clone -q -b hecate-snapshot /tmp/repo.bundle /app");
    expect(dockerfile).toContain("git -C /app checkout -q 28e92a1");
    expect(dockerfile).toContain("RUN cd /app && corepack enable && pnpm install --frozen-lockfile");
    expect(dockerfile).toContain("ENV DATABASE_URL=");
  });

  it("grades F2P plus A2P and P2P, with the reporter path moved to /tests", () => {
    expect(JSON.parse(files.get("tests/expected.json")!)).toEqual({
      FAIL_TO_PASS: ["apps/api/tests/a.test.mjs::one", "apps/api/tests/a.test.mjs::two"], PASS_TO_PASS: ["apps/api/tests/old.test.mjs::three"],
    });
    const test = files.get("tests/test.sh")!;
    expect(test).toContain("git apply --whitespace=nowarn /tests/test.diff");
    expect(test).toContain("cd /app/apps/api\npnpm build || true\nREPORT=$REPORT_DIR/node-1.json node --test --test-reporter=/tests/reporter.mjs tests/*.test.mjs || true");
    expect(test).toContain("node /tests/check.mjs /tests/expected.json /tests/reports /app/ /logs/verifier/reward.txt");
    expect(files.get("solution/solve.sh")).toContain("git apply --whitespace=nowarn /solution/fix.diff");
    expect(files.get("solution/fix.diff")).toBe(row.patch);
  });

  it("names the task and fills task.toml and instruction.md from the row", () => {
    expect(harborTaskName(row.instance_id)).toBe("cse115a-pocketwatch__pocketwatch-logout-all-1");
    expect(files.get("task.toml")).toContain('instance_id = "CSE115a-PocketWatch__PocketWatch-logout-all-1"');
    expect(files.get("task.toml")).toContain('tags = ["hecate", "cse115a", "typescript", "node-test"]');
    expect(files.get("instruction.md")).toContain("Log out of every session.");
    expect(files.get("instruction.md")).toContain("checked out at `/app` at commit `28e92a1`");
  });
});
