/**
 * Integration tests for src/collect/gitClone.ts using a local repo as the
 * clone remote. Verifies that a reused cache is synced with the remote so
 * reanalysis picks up new commits (including force-pushed history).
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cloneOrUseCache } from "../src/collect/gitClone.js";
import type { ParsedGitHubUrl } from "../src/utils/githubUrl.js";

const TEST_TIMEOUT = 30000;

async function commitFile(
  repoDir: string,
  name: string,
  content: string,
  message: string,
): Promise<string> {
  writeFileSync(path.join(repoDir, name), content);
  const git = simpleGit(repoDir);
  await git.raw(["add", "-A"]);
  await git.commit(message);
  return (await git.revparse(["HEAD"])).trim();
}

describe("cloneOrUseCache", () => {
  let remoteDir: string;
  let cacheBase: string;
  let parsed: ParsedGitHubUrl;

  beforeEach(async () => {
    remoteDir = mkdtempSync(path.join(os.tmpdir(), "git-clone-remote-"));
    cacheBase = mkdtempSync(path.join(os.tmpdir(), "git-clone-cache-"));
    const git = simpleGit(remoteDir);
    await git.init();
    await git.addConfig("user.name", "Test");
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("commit.gpgsign", "false");
    await commitFile(remoteDir, "a.ts", "export const a = 1;\n", "initial");
    parsed = { owner: "local", repo: "fixture", url: remoteDir };
  });

  afterEach(() => {
    rmSync(remoteDir, { recursive: true, force: true, maxRetries: 5 });
    rmSync(cacheBase, { recursive: true, force: true, maxRetries: 5 });
  });

  it(
    "syncs a reused cache so new remote commits are picked up",
    async () => {
      const first = await cloneOrUseCache(parsed, true, cacheBase);
      const newSha = await commitFile(
        remoteDir,
        "b.ts",
        "export const b = 2;\n",
        "add b",
      );

      const second = await cloneOrUseCache(parsed, true, cacheBase);

      expect(second).toBe(first);
      expect(existsSync(path.join(second, "b.ts"))).toBe(true);
      const head = (await simpleGit(second).revparse(["HEAD"])).trim();
      expect(head).toBe(newSha);
    },
    TEST_TIMEOUT,
  );

  it(
    "converges a reused cache after force-pushed history",
    async () => {
      await cloneOrUseCache(parsed, true, cacheBase);
      const remote = simpleGit(remoteDir);
      writeFileSync(path.join(remoteDir, "a.ts"), "export const a = 99;\n");
      await remote.raw(["add", "-A"]);
      await remote.raw(["commit", "--amend", "-m", "rewritten"]);
      const amendedSha = (await remote.revparse(["HEAD"])).trim();

      const repoPath = await cloneOrUseCache(parsed, true, cacheBase);

      const head = (await simpleGit(repoPath).revparse(["HEAD"])).trim();
      expect(head).toBe(amendedSha);
    },
    TEST_TIMEOUT,
  );

  it(
    "checks out a named branch into a separate cache key",
    async () => {
      const remote = simpleGit(remoteDir);
      const defaultBranch = (await remote.revparse(["--abbrev-ref", "HEAD"])).trim();
      await remote.checkoutLocalBranch("feat");
      const featSha = await commitFile(
        remoteDir,
        "feat.ts",
        "export const feat = 1;\n",
        "feat commit",
      );
      await remote.checkout(defaultBranch);

      const defaultPath = await cloneOrUseCache(parsed, true, cacheBase);
      expect(existsSync(path.join(defaultPath, "feat.ts"))).toBe(false);

      const featPath = await cloneOrUseCache(parsed, true, cacheBase, undefined, {
        kind: "branch",
        name: "feat",
      });
      expect(featPath).not.toBe(defaultPath);
      expect(existsSync(path.join(featPath, "feat.ts"))).toBe(true);
      const head = (await simpleGit(featPath).revparse(["HEAD"])).trim();
      expect(head).toBe(featSha);
    },
    TEST_TIMEOUT,
  );
});
