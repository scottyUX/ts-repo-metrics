import { describe, expect, it } from "vitest";
import { rejectedWithoutRun, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
import { buildHarborTask, harborSkipReason, PRIVATE_REPO_REASON, withRepoPublic, type HarborEnv } from "@/lib/cse115a/benchmark/validation/harbor";
import { repoIsPublic, type RunOptions, type run } from "@/lib/cse115a/benchmark/validation/runRow";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { applyWriteback, writebackPlan, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";

const SHA = "28e92a1c0ffee0000000000000000000000000ab";
const recipe: HarborEnv = {
  image: "node:24-bookworm@sha256:8fa9", runners: ["vitest"], package_dir: "", install_steps: [{ cwd: "", command: "npm ci" }],
  test_steps: [{ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }],
  env: { CI: "true" }, services: [], node_source: "default",
};
const row: TaskRow = { instance_id: "ryan__candlebase-T-1", repo: "ryan/candlebase", base_commit: SHA, patch: "diff --git a/a.ts b/a.ts\n", test_patch: "diff --git a/a.test.ts b/a.test.ts\n", FAIL_TO_PASS: ["a.test.ts::x"], PASS_TO_PASS: [] };

type Call = { args: string[]; options?: RunOptions };

/** A fake `git ls-remote`: succeeds, or fails with the given stderr the way `run` reports it. */
function lsRemote(stderr: string | null, calls: Call[] = []): typeof run {
  return async (cmd, args, _cwd, options) => {
    calls.push({ args, options });
    if (stderr === null) return `${SHA}\tHEAD\n`;
    throw new Error(`${cmd} ${args.join(" ")} exited 128\n${stderr}`);
  };
}

describe("repoIsPublic", () => {
  it("is true when an anonymous ls-remote succeeds, with no credentials and a short timeout", async () => {
    const calls: Call[] = [];
    expect(await repoIsPublic("ryan/candlebase", { git: lsRemote(null, calls) })).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual(["-c", "credential.helper=", "ls-remote", "https://github.com/ryan/candlebase.git", "HEAD"]);
    expect(calls[0]!.options?.env?.GIT_TERMINAL_PROMPT).toBe("0");
    expect(calls[0]!.options?.timeoutMs).toBeGreaterThan(0);
    expect(calls[0]!.options?.timeoutMs).toBeLessThanOrEqual(30_000);
  });

  it("is false when GitHub refuses (private or gone)", async () => {
    expect(await repoIsPublic("ryan/candlebase", { git: lsRemote("fatal: could not read Username for 'https://github.com': terminal prompts disabled") })).toBe(false);
    expect(await repoIsPublic("ryan/candlebase", { git: lsRemote("remote: Repository not found.\nfatal: repository 'https://github.com/ryan/candlebase.git/' not found") })).toBe(false);
  });

  it("is undefined, and logged, when the check itself fails for another reason", async () => {
    for (const failure of ["fatal: unable to access 'https://github.com/ryan/candlebase.git/': Could not resolve host: github.com", null]) {
      const log: string[] = [];
      const git: typeof run = failure
        ? lsRemote(failure)
        : async () => { throw new Error("git -c credential.helper= ls-remote https://github.com/ryan/candlebase.git HEAD timed out after 20000 ms"); };
      expect(await repoIsPublic("ryan/candlebase", { git, log: (l) => log.push(l) })).toBeUndefined();
      expect(log).toHaveLength(1);
      expect(log[0]).toContain("could not check whether ryan/candlebase is public");
    }
  });
});

describe("withRepoPublic", () => {
  it("sets true or false, and leaves the key out when the check did not say", () => {
    expect(withRepoPublic(recipe, true).repo_public).toBe(true);
    expect(withRepoPublic(recipe, false).repo_public).toBe(false);
    expect("repo_public" in withRepoPublic({ ...recipe, repo_public: false }, undefined)).toBe(false);
    expect(withRepoPublic(recipe, true)).toEqual({ ...recipe, repo_public: true });
  });
});

describe("private repositories and the two sources", () => {
  const privateRecipe = { ...recipe, repo_public: false };

  it("the github source refuses a private repository's row", () => {
    expect(harborSkipReason(privateRecipe, row, { kind: "github" })).toBe(PRIVATE_REPO_REASON);
    expect(() => buildHarborTask({ row, env: privateRecipe, source: { kind: "github" } })).toThrow(PRIVATE_REPO_REASON);
    expect(harborSkipReason({ ...recipe, repo_public: true }, row, { kind: "github" })).toBeNull();
    expect(harborSkipReason(recipe, row, { kind: "github" })).toBeNull();
  });

  it("the bundle source (scripts/exportHarbor.ts) still builds it", () => {
    const source = { kind: "bundle", file: "repo.bundle" } as const;
    expect(harborSkipReason(privateRecipe, row, source)).toBeNull();
    const files = buildHarborTask({ row, env: privateRecipe, source });
    expect(files.get("environment/Dockerfile")).toContain("COPY repo.bundle /tmp/repo.bundle");
    expect(files.get("environment/Dockerfile")).not.toContain("github.com");
  });
});

describe("write-back carries repo_public in harbor_env", () => {
  const result: ValidationResult = {
    ...rejectedWithoutRun(row, "env_error", ""), validation_status: "validated", reason: null, detail: null,
    FAIL_TO_PASS: ["a.test.ts::x"], image: "node:24-bookworm", image_digest: recipe.image, eval_script: "", log_parser: "vitest-json",
    harbor_env: { ...recipe, repo_public: false },
  };

  it("through the client", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const fake: WritebackClient = {
      from(table) {
        return {
          select() { return { eq: async () => ({ data: [{ flags: [] }], error: null }) }; },
          update(values) { if (table === "cse_benchmark_tasks") updates.push(values); return { eq: async () => ({ error: null }) }; },
        };
      },
    };
    await applyWriteback(fake, writebackPlan([result]), () => "now");
    expect((updates[0]!.harbor_env as HarborEnv).repo_public).toBe(false);
  });

  it("through writeback.sql", () => {
    expect(writebackSql([result])).toContain(`harbor_env = $hecate$${JSON.stringify({ ...recipe, repo_public: false })}$hecate$::jsonb`);
    expect(writebackSql([result])).toContain('"repo_public":false');
  });
});
