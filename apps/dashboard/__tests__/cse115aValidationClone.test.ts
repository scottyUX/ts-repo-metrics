import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rejectedWithoutRun, summarize, summaryMarkdown } from "@/lib/cse115a/benchmark/validation/batch";
import { appCloneDetail, cloneRepo, CloneError, ensureCommit, isAccessError, NO_APP_CLONE_DETAIL, redactToken, type GitAccess, type run } from "@/lib/cse115a/benchmark/validation/runRow";
import type { TaskRow } from "@/lib/cse115a/benchmark/validation/validateTask";
import { CourseRepoAccessError } from "@/lib/cse115a/githubAppToken";

const TOKEN = "ghs_s3cretInstallationToken0123456789";
const CONFIG = { appId: "1", slug: "hecate-course", privateKey: "unused" };
const row: TaskRow = { instance_id: "ryan__candlebase-T-1", repo: "ryan/candlebase", base_commit: "a".repeat(40), patch: "p", test_patch: "t", FAIL_TO_PASS: [], PASS_TO_PASS: [] };

let scratch = "";
beforeAll(async () => { scratch = await mkdtemp(join(tmpdir(), "hecate-clone-test-")); });
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

type Call = { args: string[]; env?: NodeJS.ProcessEnv };

/** A git that fails every network command the way `run` does: the command line, then git's stderr. */
function failingGit(stderr: string, calls: Call[] = []): typeof run {
  return async (cmd, args, _cwd, options) => {
    calls.push({ args, env: options?.env });
    if (args.includes("cat-file")) throw new Error(`${cmd} ${args.join(" ")} exited 128\nfatal: Not a valid object name`);
    if (args.includes("clone") || args.includes("fetch")) throw new Error(`${cmd} ${args.join(" ")} exited 128\n${stderr}`);
    return "";
  };
}

const NOT_FOUND = "remote: Repository not found.\nfatal: repository 'https://github.com/ryan/candlebase.git/' not found";
const PROMPT_DISABLED = "fatal: could not read Username for 'https://github.com': terminal prompts disabled";
const BAD_TOKEN = "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/ryan/candlebase.git/'";

const anonymous = (git: typeof run): GitAccess => ({ config: () => null, git });
const withApp = (git: typeof run): GitAccess => ({ config: () => CONFIG, token: async () => TOKEN, git });

async function cloneError(access: GitAccess): Promise<CloneError> {
  const error = await cloneRepo(row.repo, join(scratch, "clone"), undefined, access).then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(CloneError);
  return error as CloneError;
}

describe("clone failures", () => {
  it("without App config, a refused clone becomes env_error with the private-repository detail", async () => {
    for (const stderr of [NOT_FOUND, PROMPT_DISABLED]) {
      const error = await cloneError(anonymous(failingGit(stderr)));
      expect(error.message).toBe(NO_APP_CLONE_DETAIL);
      const result = rejectedWithoutRun(row, "env_error", error.message);
      expect(result).toMatchObject({ validation_status: "rejected", reason: "env_error", detail: NO_APP_CLONE_DETAIL });
    }
  });

  it("with App config, a refused tokened clone asks whether the App is installed, and never shows the token", async () => {
    const calls: Call[] = [];
    const error = await cloneError(withApp(failingGit(BAD_TOKEN, calls)));
    expect(error.message).toBe("clone failed with the course App token: is the App installed on ryan/candlebase?");
    expect(error.message).toBe(appCloneDetail(row.repo));
    // The token was used, and only in the URL handed to git.
    expect(calls[0]!.args.some((a) => a.includes(TOKEN))).toBe(true);
    expect(error.message).not.toContain(TOKEN);
    expect(String(error.stack)).not.toContain(TOKEN);
  });

  it("an App that is not installed on the repository gets the same detail", async () => {
    const access: GitAccess = {
      config: () => CONFIG,
      token: async () => { throw new CourseRepoAccessError("The course GitHub App is not installed on ryan/candlebase.", "github_app_not_installed"); },
      git: failingGit(NOT_FOUND),
    };
    expect((await cloneError(access)).message).toBe(appCloneDetail(row.repo));
  });

  it("a failure that is not about access keeps git's own message, with the token removed", async () => {
    const stderr = `fatal: unable to access 'https://x-access-token:${TOKEN}@github.com/ryan/candlebase.git/': Could not resolve host: github.com`;
    const error = await cloneError(withApp(failingGit(stderr)));
    expect(error.message).toMatch(/^clone failed: fatal: unable to access/);
    expect(error.message).toContain("Could not resolve host");
    expect(error.message).not.toContain(TOKEN);
    expect(isAccessError(stderr)).toBe(false);
  });

  it("clones with no credential prompt and no credential helper", async () => {
    const calls: Call[] = [];
    await cloneError(anonymous(failingGit(NOT_FOUND, calls)));
    expect(calls[0]!.args.slice(0, 3)).toEqual(["-c", "credential.helper=", "clone"]);
    expect(calls[0]!.env?.GIT_TERMINAL_PROMPT).toBe("0");
    expect(calls[0]!.args).toContain("https://github.com/ryan/candlebase.git");
  });

  it("a successful tokened clone leaves the remote without the token", async () => {
    const calls: Call[] = [];
    const git: typeof run = async (_cmd, args) => { calls.push({ args }); return ""; };
    await cloneRepo(row.repo, join(scratch, "ok"), undefined, { config: () => CONFIG, token: async () => TOKEN, git });
    expect(calls[1]!.args).toEqual(["remote", "set-url", "origin", "https://github.com/ryan/candlebase.git"]);
  });

  it("the base-commit fetch uses the App token when configured and fails with the same details", async () => {
    const calls: Call[] = [];
    const tokened = await ensureCommit("/repo", row.base_commit, undefined, row.repo, withApp(failingGit(BAD_TOKEN, calls))).then(() => null, (e: unknown) => e as Error);
    expect(tokened?.message).toBe(appCloneDetail(row.repo));
    expect(tokened?.message).not.toContain(TOKEN);
    const fetch = calls.find((c) => c.args.includes("fetch"))!;
    expect(fetch.args).toContain(`https://x-access-token:${TOKEN}@github.com/ryan/candlebase.git`);
    expect(fetch.env?.GIT_TERMINAL_PROMPT).toBe("0");

    const anon = await ensureCommit("/repo", row.base_commit, undefined, row.repo, anonymous(failingGit(NOT_FOUND))).then(() => null, (e: unknown) => e as Error);
    expect(anon?.message).toBe(NO_APP_CLONE_DETAIL);
  });

  it("redacts the token and any URL credentials", () => {
    expect(redactToken(`x ${TOKEN} y`, TOKEN)).toBe("x *** y");
    expect(redactToken("git clone https://x-access-token:abc@github.com/o/r.git")).toBe("git clone https://***@github.com/o/r.git");
  });
});

describe("batch summary for env_error rows", () => {
  it("shows the clone-failure detail in the reason cell", () => {
    const failed = rejectedWithoutRun(row, "env_error", NO_APP_CLONE_DETAIL);
    const summary = summarize([failed]);
    expect(summary.rows[0]!.reason).toBe(`env_error: ${NO_APP_CLONE_DETAIL}`);
    expect(summaryMarkdown(summary)).toContain(`| ryan__candlebase-T-1 | rejected | env_error: ${NO_APP_CLONE_DETAIL} | 0 |`);
  });

  it("shows the first line of any other env_error detail, with pipes escaped", () => {
    const crashed = rejectedWithoutRun(row, "env_error", "\ndocker run | exited 125\nmore");
    expect(summarize([crashed]).rows[0]!.reason).toBe("env_error: docker run \\| exited 125");
    expect(summarize([rejectedWithoutRun(row, "env_error", "")]).rows[0]!.reason).toBe("env_error");
  });
});
