/**
 * checkoutCommit against a local git repo. No network.
 */

import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { describe, it, expect, afterEach } from "vitest";
import { checkoutCommit } from "../src/collect/checkoutCommit.js";
import { analyzeStructure } from "../src/pipeline/analyzeStructure.js";

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

describe("checkoutCommit", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  it("checks out the older SHA from a local repo with two commits", async () => {
    const remoteDir = mkdtempSync(path.join(os.tmpdir(), "checkout-remote-"));
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "checkout-cache-"));
    dirs.push(remoteDir, cacheDir);

    const git = simpleGit(remoteDir);
    await git.init();
    await git.addConfig("user.name", "Test");
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("commit.gpgsign", "false");

    const older = await commitFile(remoteDir, "a.py", "VALUE = 1\n", "initial");
    const newer = await commitFile(remoteDir, "a.py", "VALUE = 2\n", "second");
    expect(older).not.toBe(newer);
    expect(older).toMatch(/^[0-9a-f]{40}$/);

    const checkedOut = await checkoutCommit({
      owner: "local",
      repo: "fixture",
      sha: older,
      cacheDir,
      remoteUrl: remoteDir,
    });

    expect(checkedOut.commit).toBe(older);
    const head = (await simpleGit(checkedOut.repoPath).revparse(["HEAD"])).trim();
    expect(head).toBe(older);
    expect(readFileSync(path.join(checkedOut.repoPath, "a.py"), "utf8")).toBe("VALUE = 1\n");

    const report = await analyzeStructure(checkedOut.repoPath, { paths: ["a.py"] });
    expect(report.commit).toBe(older);
    expect(report.files.map((f) => f.file)).toEqual(["a.py"]);
  }, 30_000);
});
