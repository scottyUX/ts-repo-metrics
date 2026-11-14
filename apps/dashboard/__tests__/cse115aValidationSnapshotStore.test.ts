// #288: a copy of every snapshot bundle in a private Supabase Storage bucket. A fake store stands in
// for Supabase (no network); real git, with a local repository standing in for github.com, and a
// fake suite runner instead of Docker.
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { batchRun, validateBatchRow, type BatchRun } from "@/lib/cse115a/benchmark/validation/batchRun";
import type { RunResults } from "@/lib/cse115a/benchmark/validation/compareRuns";
import { bundleRepo, CloneError, NO_APP_CLONE_DETAIL, run } from "@/lib/cse115a/benchmark/validation/runRow";
import type { RunPlan, State, SuiteRunner } from "@/lib/cse115a/benchmark/validation/runner";
import { findBundle, rowCheckout, snapshotOnly, snapshotPath, type BatchGit } from "@/lib/cse115a/benchmark/validation/snapshots";
import {
  bucketSnapshotStore, ensureSnapshotBucket, SNAPSHOT_BUCKET, SNAPSHOT_SIZE_LIMIT, supabaseBucketAdmin, supabaseSnapshotStore, uploadSnapshotDir,
  type BucketAdmin, type BucketFiles, type SnapshotStore,
} from "@/lib/cse115a/benchmark/validation/snapshotStore";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@localhost"];
let scratch = "";
/** Stands in for github.com: `<github>/team/app.git`. */
let github = "";
let base = "";
let row: TaskRow;
/** The row's bundle, written once from the stand-in at base_commit. */
let bundle = "";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "hecate-store-test-"));
  github = join(scratch, "github");
  const repo = join(github, "team", "app.git");
  await mkdir(join(repo, "src"), { recursive: true });
  await run("git", ["init", "-q", "-b", "main"], repo);
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "app", scripts: { test: "vitest run" }, devDependencies: { vitest: "^3.0.0" } }, null, 2) + "\n",
    "package-lock.json": "{}\n",
    "src/a.ts": "export const add = (a: number, b: number) => a - b;\n",
    "src/b.test.ts": "import { it } from \"vitest\";\nit(\"keeps\", () => {});\n",
  };
  for (const [path, text] of Object.entries(files)) await writeFile(join(repo, path), text);
  await run("git", [...GIT_ID, "add", "-A"], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "base"], repo);
  base = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  await writeFile(join(repo, "src/a.test.ts"), "import { it, expect } from \"vitest\";\nimport { add } from \"./a\";\nit(\"adds\", () => { expect(add(1, 2)).toBe(3); });\n");
  await run("git", ["add", "src/a.test.ts"], repo);
  const testPatch = await run("git", ["diff", "--cached", base], repo);
  await run("git", [...GIT_ID, "commit", "-qm", "test"], repo);
  await writeFile(join(repo, "src/a.ts"), "export const add = (a: number, b: number) => a + b;\n");
  const patch = await run("git", ["diff", "HEAD"], repo);
  await run("git", ["checkout", "-q", "-f", base], repo);
  row = { instance_id: "team__app-T-1", repo: "team/app", base_commit: base, patch, test_patch: testPatch, FAIL_TO_PASS: ["src/a.test.ts::adds"], PASS_TO_PASS: [] };
  bundle = join(scratch, "row.bundle");
  await bundleRepo(repo, base, bundle);
});
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

/** Stands in for Docker: needs base_commit in the checkout; r1 fails the proving test, r2 passes it. */
class CheckoutRunner implements SuiteRunner {
  async runSuite(plan: RunPlan, state: State): Promise<RunResults> {
    await run("git", ["cat-file", "-e", `${plan.baseCommit}^{commit}`], plan.repoDir);
    const keeps = { "src/b.test.ts::keeps": "passed" as const };
    if (state === "r0") return keeps;
    return { ...keeps, "src/a.test.ts::adds": state === "r1" ? "failed" : "passed" };
  }
}

/** An in-memory bucket that never overwrites, counting every call; `fail` makes each call throw. */
class FakeStore implements SnapshotStore {
  objects = new Map<string, Buffer>();
  calls: string[] = [];
  constructor(public fail: string | null = null) {}
  async has(id: string) {
    this.calls.push(`has ${id}`);
    if (this.fail) throw new Error(this.fail);
    return this.objects.has(id);
  }
  async upload(id: string, file: string) {
    this.calls.push(`upload ${id}`);
    if (this.fail) throw new Error(this.fail);
    if (this.objects.has(id)) return "already stored" as const;
    this.objects.set(id, await readFile(file));
    return "uploaded" as const;
  }
  async download(id: string, file: string) {
    this.calls.push(`download ${id}`);
    if (this.fail) throw new Error(this.fail);
    const body = this.objects.get(id);
    if (!body) return false;
    await writeFile(file, body);
    return true;
  }
}

const cloneFromStandIn: BatchGit["clone"] = async (fullName, dir) => { await run("git", ["clone", "-q", join(github, `${fullName}.git`), dir]); };
const REFUSED = new CloneError(NO_APP_CLONE_DETAIL);
const refusedClone: BatchGit["clone"] = async () => { throw REFUSED; };

function context(out: string, git: BatchGit, options: { store?: SnapshotStore | null; snapshots?: boolean; snapshotsFrom?: string } = {}): BatchRun {
  return batchRun({ out, snapshots: options.snapshots ?? false, snapshotsFrom: options.snapshotsFrom, store: options.store, timeoutSeconds: 60, log: () => {}, git, runner: new CheckoutRunner(), imageDigest: async () => null, repoIsPublic: async () => true });
}

async function freshOut(withBundle = false): Promise<string> {
  const out = await mkdtemp(join(scratch, "out-"));
  if (withBundle) {
    await mkdir(join(out, "snapshots"), { recursive: true });
    await run("cp", [bundle, join(out, snapshotPath(row.instance_id))]);
  }
  return out;
}

/** A result without its timings, which differ from run to run. */
function stable(r: ValidationResult): unknown {
  return JSON.parse(JSON.stringify(r, (key, value) => (/(_ms|_at|duration|seconds|timings)$/i.test(key) ? undefined : value)));
}

describe("the store's configuration", () => {
  it("is null unless both the URL and the service-role key are set", () => {
    expect(supabaseSnapshotStore({})).toBeNull();
    expect(supabaseSnapshotStore({ SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(supabaseSnapshotStore({ SUPABASE_SERVICE_ROLE_KEY: "k" })).toBeNull();
    expect(supabaseSnapshotStore({ SUPABASE_URL: " ", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBeNull();
    expect(supabaseBucketAdmin({})).toBeNull();
    // No request is made by building it.
    expect(supabaseSnapshotStore({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" })).not.toBeNull();
  });
});

describe("1. no store configured: exactly as before", () => {
  it("the snapshot-only pass prints the same lines with store null or absent", async () => {
    const a = await snapshotOnly({ rows: [row], out: await freshOut(), redo: false, git: { clone: cloneFromStandIn } });
    const b = await snapshotOnly({ rows: [row], out: await freshOut(), redo: false, git: { clone: cloneFromStandIn }, store: null });
    expect(a.lines).toEqual([`${row.instance_id}: snapshot written`, "1 snapshot(s) written, 0 already had one, 0 failed, of 1 row(s)"]);
    expect(b.lines).toEqual(a.lines);
  });

  it("a normal run and a GitHub-failure restore give the same results with store null", async () => {
    for (const [git, withBundle] of [[{ clone: cloneFromStandIn }, false], [{ clone: refusedClone }, true]] as const) {
      const absent = await validateBatchRow(context(await freshOut(withBundle), git, { snapshots: true }), { ...row }, join(scratch, "logs"));
      const nulled = await validateBatchRow(context(await freshOut(withBundle), git, { snapshots: true, store: null }), { ...row }, join(scratch, "logs"));
      expect(absent.validation_status).toBe("validated");
      expect(stable(nulled)).toEqual(stable(absent));
    }
    // No bundle anywhere: env_error, the original failure.
    const none = await validateBatchRow(context(await freshOut(), { clone: refusedClone }, { store: null }), { ...row }, join(scratch, "logs"));
    expect(none.detail).toBe(NO_APP_CLONE_DETAIL);
  });
});

describe("uploading", () => {
  it("2. a new bundle is uploaded once; a second pass says already stored and uploads nothing", async () => {
    const out = await freshOut();
    const store = new FakeStore();
    const first = await snapshotOnly({ rows: [row], out, redo: false, git: { clone: cloneFromStandIn }, store });
    expect(first.lines).toEqual([`${row.instance_id}: snapshot written; stored`, "1 snapshot(s) written, 0 already had one, 0 failed, of 1 row(s), 1 stored, 0 upload failures"]);
    expect(store.objects.get(row.instance_id)).toEqual(await readFile(join(out, snapshotPath(row.instance_id))));
    const second = await snapshotOnly({ rows: [row], out, redo: false, git: { clone: cloneFromStandIn }, store });
    expect(second.lines).toEqual([`${row.instance_id}: already has a snapshot; already stored`, "0 snapshot(s) written, 1 already had one, 0 failed, of 1 row(s), 0 stored, 0 upload failures"]);
    expect(store.calls.filter((c) => c.startsWith("upload"))).toEqual([`upload ${row.instance_id}`]);
  });

  it("--redo rewrites the local bundle but never the stored copy", async () => {
    const out = await freshOut();
    const store = new FakeStore();
    store.objects.set(row.instance_id, Buffer.from("the first copy"));
    const redone = await snapshotOnly({ rows: [row], out, redo: true, git: { clone: cloneFromStandIn }, store });
    expect(redone.lines[0]).toBe(`${row.instance_id}: snapshot written; already stored`);
    expect(store.objects.get(row.instance_id)?.toString()).toBe("the first copy");
  });

  it("3. a bundle already in the folder but not in the store is uploaded by the snapshot-only pass", async () => {
    const out = await freshOut(true);
    const store = new FakeStore();
    let cloned = false;
    const report = await snapshotOnly({ rows: [row], out, redo: false, git: { clone: async () => { cloned = true; } }, store });
    expect(cloned).toBe(false);
    expect(report.lines).toEqual([`${row.instance_id}: already has a snapshot; stored`, "0 snapshot(s) written, 1 already had one, 0 failed, of 1 row(s), 1 stored, 0 upload failures"]);
    expect(store.calls).toEqual([`has ${row.instance_id}`, `upload ${row.instance_id}`]);
  });

  it("4. an upload failure is on the row's line and in the count, and changes nothing else", async () => {
    const report = await snapshotOnly({ rows: [row], out: await freshOut(), redo: false, git: { clone: cloneFromStandIn }, store: new FakeStore("Storage: Bucket not found\nmore") });
    expect(report.lines).toEqual([`${row.instance_id}: snapshot written; upload failed: Storage: Bucket not found`, "1 snapshot(s) written, 0 already had one, 0 failed, of 1 row(s), 0 stored, 1 upload failures"]);
    expect(report).toMatchObject({ written: 1, failed: 0, uploadFailures: 1 });

    // A normal run with --snapshots: the result is the same as with no store; the log says what happened.
    const lines: string[] = [];
    const failing = { ...context(await freshOut(), { clone: cloneFromStandIn }, { snapshots: true, store: new FakeStore("network down") }), log: (l: string) => lines.push(l) };
    const result = await validateBatchRow(failing, { ...row }, join(scratch, "logs"));
    const plain = await validateBatchRow(context(await freshOut(), { clone: cloneFromStandIn }, { snapshots: true }), { ...row }, join(scratch, "logs"));
    expect(stable(result)).toEqual(stable(plain));
    expect(result.snapshot_bundle).toBe(snapshotPath(row.instance_id));
    expect(lines).toContain("  snapshot written; upload failed: network down");
  });

  it("a normal run with --snapshots uploads the new bundle", async () => {
    const store = new FakeStore();
    const lines: string[] = [];
    const ctx = { ...context(await freshOut(), { clone: cloneFromStandIn }, { snapshots: true, store }), log: (l: string) => lines.push(l) };
    await validateBatchRow(ctx, { ...row }, join(scratch, "logs"));
    expect(store.objects.has(row.instance_id)).toBe(true);
    expect(lines).toContain("  snapshot written; stored");
  });
});

describe("restoring", () => {
  it("5. the folder wins over --snapshots-from, which wins over the store; the store's copy lands in <out>/snapshots/", async () => {
    const elsewhere = await mkdtemp(join(scratch, "from-"));
    await run("cp", [bundle, join(elsewhere, `${row.instance_id}.bundle`)]);
    const store = new FakeStore();
    store.objects.set(row.instance_id, await readFile(bundle));

    const own = await freshOut(true);
    expect(await findBundle(own, row, { snapshotsFrom: elsewhere, store })).toBe(join(own, snapshotPath(row.instance_id)));
    const from = await freshOut();
    expect(await findBundle(from, row, { snapshotsFrom: elsewhere, store })).toBe(join(elsewhere, `${row.instance_id}.bundle`));
    expect(store.calls).toEqual([]);

    const out = await freshOut();
    const lines: string[] = [];
    const ctx = { ...context(out, { clone: refusedClone }, { store }), log: (l: string) => lines.push(l) };
    const result = await validateBatchRow(ctx, { ...row }, join(out, "logs"));
    expect(store.calls).toEqual([`download ${row.instance_id}`]);
    expect(result.validation_status).toBe("validated");
    expect(result.repo_source).toBe("snapshot");
    expect(result.snapshot_bundle).toBe(snapshotPath(row.instance_id));
    expect(await readFile(join(out, snapshotPath(row.instance_id)))).toEqual(await readFile(bundle));
    expect(lines.some((l) => l.includes("validating from the snapshot"))).toBe(true);
    // The same row validated from the folder's own bundle gives the same result.
    const fromFolder = await validateBatchRow(context(await freshOut(true), { clone: refusedClone }), { ...row }, join(scratch, "logs"));
    expect(stable(result)).toEqual(stable(fromFolder));
  });

  it("a store without the row's copy, or one that cannot be read, leaves the original error", async () => {
    for (const store of [new FakeStore(), new FakeStore("Storage: fetch failed")]) {
      const out = await freshOut();
      await expect(rowCheckout({ out, row, clones: new Map(), log: () => {}, git: { clone: refusedClone }, store })).rejects.toBe(REFUSED);
      expect(await exists(join(out, snapshotPath(row.instance_id)))).toBe(false);
    }
  });

  it("6. a downloaded copy that fails the check is deleted and the original GitHub error is thrown", async () => {
    const whole = await readFile(bundle);
    const otherRepo = join(scratch, "other");
    await mkdir(otherRepo, { recursive: true });
    await run("git", ["init", "-q", "-b", "main"], otherRepo);
    await writeFile(join(otherRepo, "x.txt"), "x\n");
    await run("git", [...GIT_ID, "add", "-A"], otherRepo);
    await run("git", [...GIT_ID, "commit", "-qm", "x"], otherRepo);
    const wrong = join(scratch, "wrong.bundle");
    await bundleRepo(otherRepo, "HEAD", wrong);
    // Truncated (git bundle verify alone passes this), not a bundle, and another repository's bundle.
    for (const body of [whole.subarray(0, Math.floor(whole.length / 2)), Buffer.from("not a bundle"), await readFile(wrong)]) {
      const store = new FakeStore();
      store.objects.set(row.instance_id, body);
      const out = await freshOut();
      const lines: string[] = [];
      await expect(rowCheckout({ out, row, clones: new Map(), log: (l) => lines.push(l), git: { clone: refusedClone }, store })).rejects.toBe(REFUSED);
      expect(await readdir(join(out, "snapshots"))).toEqual([]);
      expect(lines.some((l) => l.includes("failed the check and was deleted"))).toBe(true);
    }
  });

  it("7. when GitHub works, the store is never called", async () => {
    const store = new FakeStore("must not be called");
    const result = await validateBatchRow(context(await freshOut(), { clone: cloneFromStandIn }, { store }), { ...row }, join(scratch, "logs"));
    expect(result.validation_status).toBe("validated");
    expect(result.repo_source).toBe("github");
    expect(store.calls).toEqual([]);
  });
});

describe("the Supabase store over storage-js answers", () => {
  const apiError = (message: string, status: number, statusCode: string) => ({ message, status, statusCode });
  function files(overrides: Partial<BucketFiles>): BucketFiles {
    return {
      exists: async () => ({ data: false, error: null }),
      upload: async () => ({ data: {}, error: null }),
      download: async () => ({ data: null, error: null }),
      ...overrides,
    };
  }

  it("uploads with upsert false and the octet-stream type; an existing object is already stored, any other error throws", async () => {
    const seen: unknown[] = [];
    const ok = bucketSnapshotStore(files({ upload: async (path, body, options) => { seen.push(path, body.length, options); return { data: {}, error: null }; } }));
    expect(await ok.upload(row.instance_id, bundle)).toBe("uploaded");
    expect(seen).toEqual([`${row.instance_id}.bundle`, (await readFile(bundle)).length, { contentType: "application/octet-stream", upsert: false }]);
    const duplicate = bucketSnapshotStore(files({ upload: async () => ({ data: null, error: apiError("The resource already exists", 400, "409") }) }));
    expect(await duplicate.upload(row.instance_id, bundle)).toBe("already stored");
    const missing = bucketSnapshotStore(files({ upload: async () => ({ data: null, error: apiError("Bucket not found", 400, "404") }) }));
    await expect(missing.upload(row.instance_id, bundle)).rejects.toThrow("Storage: Bucket not found");
  });

  it("refuses a bundle over the 50 MB limit before sending it", async () => {
    const big = join(scratch, "big.bundle");
    await writeFile(big, "");
    await truncate(big, SNAPSHOT_SIZE_LIMIT + 1);
    let sent = false;
    const store = bucketSnapshotStore(files({ upload: async () => { sent = true; return { data: {}, error: null }; } }));
    await expect(store.upload("big", big)).rejects.toThrow("the bundle is 50.0 MB, over the bucket's 50.0 MB limit; kept only in this folder");
    expect(sent).toBe(false);
  });

  it("download: a missing object is false, the file is written whole, another error throws", async () => {
    const dir = await mkdtemp(join(scratch, "dl-"));
    const target = join(dir, "x.bundle");
    const notFound = bucketSnapshotStore(files({ download: async () => ({ data: null, error: { message: "Object not found", originalError: { status: 400 } } }) }));
    expect(await notFound.download("x", target)).toBe(false);
    const body = await readFile(bundle);
    const found = bucketSnapshotStore(files({ download: async () => ({ data: new Blob([body]), error: null }) }));
    expect(await found.download("x", target)).toBe(true);
    expect(await readFile(target)).toEqual(body);
    expect(await readdir(dir)).toEqual(["x.bundle"]);
    const broken = bucketSnapshotStore(files({ download: async () => ({ data: null, error: { message: "Internal Server Error", originalError: { status: 500 } } }) }));
    await expect(broken.download("x", target)).rejects.toThrow("Storage: Internal Server Error");
  });

  it("has: true, false on not found, throws otherwise", async () => {
    expect(await bucketSnapshotStore(files({ exists: async () => ({ data: true, error: null }) })).has("x")).toBe(true);
    expect(await bucketSnapshotStore(files({ exists: async () => ({ data: false, error: { message: "", originalError: { status: 404 } } }) })).has("x")).toBe(false);
    await expect(bucketSnapshotStore(files({ exists: async () => ({ data: false, error: { message: "denied", status: 403, statusCode: "403" } }) })).has("x")).rejects.toThrow("denied");
  });
});

describe("8. uploadSnapshots.ts", () => {
  async function folder(ids: string[]): Promise<string> {
    const dir = await mkdtemp(join(scratch, "batch-"));
    await mkdir(join(dir, "snapshots"), { recursive: true });
    for (const id of ids) await run("cp", [bundle, join(dir, "snapshots", `${id}.bundle`)]);
    await writeFile(join(dir, "snapshots", "notes.txt"), "not a bundle\n");
    return dir;
  }

  it("--dry-run lists what it would upload and uploads nothing", async () => {
    const dir = await folder(["A-1", "B-1"]);
    const store = new FakeStore();
    store.objects.set("B-1", Buffer.from("x"));
    const report = await uploadSnapshotDir({ dir, store, dryRun: true });
    expect(report.lines[0]).toMatch(/^A-1: would upload \(0\.\d MB\)$/);
    expect(report.lines.slice(1)).toEqual(["B-1: already stored", "Dry run: 1 would be uploaded, 1 already stored, 0 check failures, of 2 bundle(s); nothing uploaded"]);
    expect(store.calls.filter((c) => c.startsWith("upload"))).toEqual([]);
    expect([...store.objects.keys()]).toEqual(["B-1"]);
  });

  it("uploads what is missing, then says already stored on a second run; --only limits it", async () => {
    const dir = await folder(["A-1", "B-1", "C-1"]);
    const store = new FakeStore();
    const first = await uploadSnapshotDir({ dir, store, only: ["A-1", "C-1", "Z-9"] });
    expect(first.lines).toEqual([`Z-9: no bundle in ${join(dir, "snapshots")}`, "A-1: stored", "C-1: stored", "2 stored, 0 already stored, 0 upload failures, of 2 bundle(s), 1 not found"]);
    expect([...store.objects.keys()].sort()).toEqual(["A-1", "C-1"]);
    const second = await uploadSnapshotDir({ dir, store });
    expect(second.lines).toEqual(["A-1: already stored", "B-1: stored", "C-1: already stored", "1 stored, 2 already stored, 0 upload failures, of 3 bundle(s)"]);
    const failing = await uploadSnapshotDir({ dir, store: new FakeStore("Storage: timeout") });
    expect(failing.failures).toBe(3);
    expect(failing.lines[0]).toBe("A-1: upload failed: Storage: timeout");
  });

  it("the script refuses to run without the Supabase variables", async () => {
    const script = fileURLToPath(new URL("../scripts/uploadSnapshots.ts", import.meta.url));
    const tsconfig = fileURLToPath(new URL("../tsconfig.json", import.meta.url));
    const env = { ...process.env, SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
    const { code, stderr } = await new Promise<{ code: number | null; stderr: string }>((done) => {
      const child = spawn("npx", ["tsx", "--tsconfig", tsconfig, script, "--dir", scratch, "--dry-run"], { env, stdio: ["ignore", "pipe", "pipe"] });
      let text = "";
      child.stderr.on("data", (chunk) => { text += chunk; });
      child.on("close", (exitCode) => done({ code: exitCode, stderr: text }));
    });
    expect(code).toBe(1);
    expect(stderr).toContain("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }, 60_000);
});

describe("9. createSnapshotBucket.ts", () => {
  type Bucket = { id: string; public: boolean; file_size_limit?: number | null; created_at?: string };
  function admin(initial: Bucket | null): BucketAdmin & { created: unknown[] } {
    let bucket = initial;
    const created: unknown[] = [];
    return {
      created,
      getBucket: async () => (bucket ? { data: bucket, error: null } : { data: null, error: { message: "Bucket not found", status: 400, statusCode: "404" } }),
      createBucket: async (id, options) => {
        created.push([id, options]);
        bucket = { id, public: options.public, file_size_limit: options.fileSizeLimit, created_at: "2026-11-13T00:00:00Z" };
        return { data: { name: id }, error: null };
      },
    };
  }

  it("creates the bucket private with a 50 MB limit", async () => {
    const fake = admin(null);
    const lines: string[] = [];
    expect(await ensureSnapshotBucket(fake, (l) => lines.push(l))).toBe("created");
    expect(fake.created).toEqual([[SNAPSHOT_BUCKET, { public: false, fileSizeLimit: 52428800 }]]);
    expect(lines).toEqual(["Created: benchmark-snapshots: private, file size limit 50.0 MB (52428800 bytes), created 2026-11-13T00:00:00Z"]);
  });

  it("reports an existing private bucket and changes nothing", async () => {
    const fake = admin({ id: SNAPSHOT_BUCKET, public: false, file_size_limit: SNAPSHOT_SIZE_LIMIT });
    const lines: string[] = [];
    expect(await ensureSnapshotBucket(fake, (l) => lines.push(l))).toBe("exists");
    expect(fake.created).toEqual([]);
    expect(lines).toEqual(["Already exists: benchmark-snapshots: private, file size limit 50.0 MB (52428800 bytes)"]);
  });

  it("refuses an existing public bucket", async () => {
    const fake = admin({ id: SNAPSHOT_BUCKET, public: true, file_size_limit: SNAPSHOT_SIZE_LIMIT });
    await expect(ensureSnapshotBucket(fake, () => {})).rejects.toThrow(/exists and is PUBLIC.*Not continuing/);
    expect(fake.created).toEqual([]);
  });

  it("stops on any other error from getBucket", async () => {
    const fake: BucketAdmin = { getBucket: async () => ({ data: null, error: { message: "Invalid Compact JWS", status: 400, statusCode: "403" } }), createBucket: async () => { throw new Error("must not create"); } };
    await expect(ensureSnapshotBucket(fake, () => {})).rejects.toThrow("Storage: Invalid Compact JWS");
  });
});
