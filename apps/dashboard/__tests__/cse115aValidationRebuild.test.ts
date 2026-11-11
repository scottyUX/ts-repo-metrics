import { describe, expect, it } from "vitest";
import { rejectedWithoutRun, writebackSql } from "@/lib/cse115a/benchmark/validation/batch";
import { loadRebuildSource, rebuildRow, STAFF_REBUILT_FLAG, type GitRunner, type RebuildSourceClient } from "@/lib/cse115a/benchmark/validation/rebuildRow";
import type { TaskRow, ValidationResult } from "@/lib/cse115a/benchmark/validation/validateTask";
import { applyWriteback, writebackPlan, type WritebackClient } from "@/lib/cse115a/benchmark/validation/writeback";
import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";

/** `git diff` output for one added file. */
function added(path: string, lines: string[]): string {
  return [
    `diff --git a/${path} b/${path}`, "new file mode 100644", "index 0000000..1111111", "--- /dev/null", `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`), "",
  ].join("\n");
}

const M = "96798e0b3120839e06aeee9b6a5b99021aa8bb80";
const PARENT = "40b28261f1148d6f013c1c9817f0b4398f1f8628";
const BASE_TAG = "d33ab4d78491bde03438524d90c2a98986756f50";

/** A fake git: answers `rev-parse M^1` and `git diff <from> <to>` from tables, records every call. */
function fakeGit(diffs: Record<string, string>, parent = PARENT) {
  const calls: string[][] = [];
  const git: GitRunner = async (args) => {
    calls.push(args);
    if (args[0] === "rev-parse" && args[1] === `${M}^1`) return `${parent}\n`;
    if (args[0] === "diff") {
      const key = `${args.at(-2)}..${args.at(-1)}`;
      if (key in diffs) return diffs[key]!;
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  return { git, calls };
}

const SPEC = added("docs/tasks/sprint-2/COL-04-T-4.md", ["---", "id: COL-04-T-4", "---", "Show ratings."]);
const OTHER_SPRINT_DOC = added("docs/tasks/sprint-1/COL-01-T-1.md", ["old sprint's task, not this one"]);
const CODE = added("server/src/routes/ratings.ts", ["export const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;", "// contact jdoe@ucsc.edu"]);
const TESTS = added("server/backend_tests/ratings.test.ts", ["import { it, expect } from \"vitest\";", "it(\"averages ratings\", () => { expect(1).toBe(1); });"]);
/** What the previous task (T-2, the branch this PR was merged into) changed; must never appear in this row. */
const PREVIOUS_TASK = added("src/components/StarRating.tsx", ["export function StarRating() { return null; }"]);

/** The row as captured: the base tag sits on the commit with the spec and all the code, so nothing was left to diff. */
const captured: TaskRow & Record<string, unknown> = {
  instance_id: "JoKHerre__Bookworm-COL-04-T-4",
  repo: "JoKHerre/Bookworm",
  base_commit: BASE_TAG,
  environment_setup_commit: BASE_TAG,
  patch: added("docs/tasks/sprint-2/COL-04-T-4.md", ["estimate_hours: 3"]),
  test_patch: "",
  FAIL_TO_PASS: [],
  PASS_TO_PASS: [],
  problem_statement: "# COL-04-T-4\n\nDisplay book ratings (as stored, already scrubbed).",
  hints_text: "stored hints",
  version: "sprint-2",
  difficulty: "1-4 hours",
};

const task = {
  slot: 2, taskId: "COL-04-T-4", prNumber: 115, prUrl: "https://github.com/JoKHerre/Bookworm/pull/115", repoFullName: "JoKHerre/Bookworm",
  taskPath: "docs/tasks/sprint-2/COL-04-T-4.md", specMarkdown: "# COL-04-T-4 by Jo Doe (a different text than the stored one)",
  spec: { assignee: "Jo Doe" }, validation: null, analysisResultId: "a-1",
  pr: { title: "COL-04-T-4", body: "", headRef: "task/COL-04-T-4", author: "jokherre", mergedAt: "2026-11-04T06:07:27Z", baseSha: PARENT, mergeCommitSha: M },
  baseCommit: BASE_TAG, baseCommitSource: "base_tag", baseTagSameAuthor: null,
  diff: captured.patch, diffBytes: 0, diffTruncated: false, diffError: null, comments: [], checks: [],
} as unknown as TaskSnapshot;

const rebuild = (diff: string, extra: Partial<Parameters<typeof rebuildRow>[0]> = {}) => {
  const fake = fakeGit({ [`${PARENT}..${M}`]: diff, [`${BASE_TAG}..${M}`]: PREVIOUS_TASK + diff });
  return { fake, result: rebuildRow({ row: captured, task, assignmentNumber: 2, studentEmail: "jdoe@ucsc.edu", git: fake.git, expectedPr: 115, ...extra }) };
};

describe("rebuildRow", () => {
  it("spec + code in one tagged commit: base becomes M^1, the code goes to patch and the tests to test_patch", async () => {
    const { result } = rebuild(SPEC + CODE + TESTS);
    const { row } = await result;
    expect(row.base_commit).toBe(PARENT);
    expect(row.environment_setup_commit).toBe(PARENT);
    expect(row.patch).toContain("+++ b/server/src/routes/ratings.ts");
    expect(row.patch).not.toContain("ratings.test.ts");
    expect(row.test_patch).toContain("+++ b/server/backend_tests/ratings.test.ts");
    expect(row.test_patch).not.toContain("routes/ratings.ts");
    expect(row.FAIL_TO_PASS).toEqual(["server/backend_tests/ratings.test.ts::averages ratings"]);
    expect(row.PASS_TO_PASS).toEqual([]);
    expect(row.rebuild).toEqual({
      rebuilt_from: "merge-parent", merge_commit: M, original_base_commit: BASE_TAG,
      original_patch_sha256: expect.stringMatching(/^[0-9a-f]{64}$/), original_test_patch_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
  });

  it("stacked PR: diffs M^1..M, so the previous task's change (reachable from the old base) is left out", async () => {
    const { fake, result } = rebuild(CODE + TESTS);
    const { row } = await result;
    expect(fake.calls).toEqual([["rev-parse", `${M}^1`], ["diff", "--no-color", "--no-ext-diff", PARENT, M]]);
    expect(row.patch).not.toContain("StarRating");
    expect(row.patch.match(/^diff --git /gm)).toHaveLength(1);
  });

  it("drops this sprint's task file only, copies problem_statement and the other task fields, and scrubs a UCSC email", async () => {
    const { row, droppedFiles, flags } = await rebuild(SPEC + OTHER_SPRINT_DOC + CODE + TESTS).result;
    expect(droppedFiles).toEqual(["docs/tasks/sprint-2/COL-04-T-4.md"]);
    expect(row.patch).not.toContain("docs/tasks/sprint-2/");
    expect(row.patch).toContain("+++ b/docs/tasks/sprint-1/COL-01-T-1.md");
    expect(row.problem_statement).toBe(captured.problem_statement);
    expect([row.hints_text, row.version, row.difficulty, row.instance_id, row.repo]).toEqual(["stored hints", "sprint-2", "1-4 hours", captured.instance_id, captured.repo]);
    expect(row.patch).toContain("+// contact student@example.com");
    expect(row.patch).not.toContain("jdoe@ucsc.edu");
    expect(flags).toEqual(["pii_scrubbed_from_patch"]);
  });

  it("refuses when --pr does not match the snapshot's PR, before touching git", async () => {
    const { fake, result } = rebuild(CODE + TESTS, { expectedPr: 114 });
    await expect(result).rejects.toThrow("JoKHerre__Bookworm-COL-04-T-4: the snapshot's task is PR #115, not #114");
    expect(fake.calls).toEqual([]);
  });
});

describe("loadRebuildSource (fake Supabase)", () => {
  /** Answers the two reads loadRebuildSource makes, and records the filters it used. */
  function fakeDb(sources: unknown[], email: string | null) {
    const filters: string[] = [];
    const db: RebuildSourceClient = {
      from(table) {
        return {
          select(columns) {
            return {
              eq(column: string, value: string) {
                filters.push(`${table}.${column}=${value}`);
                const result: { data: unknown; error: null } = { data: table === "cse_benchmark_task_sources" ? sources : null, error: null };
                return Object.assign(Promise.resolve(result), {
                  eq(c2: string, v2: string) {
                    filters.push(`${table}.${c2}=${v2}`, `select ${columns}`);
                    return { maybeSingle: async () => ({ data: email ? { ucsc_email: email } : null, error: null }) };
                  },
                });
              },
            };
          },
        };
      },
    };
    return { db, filters };
  }
  const submission = (attempt: number, superseded: boolean, prNumber: number) => ({
    assignment_number: 2, attempt, superseded_at: superseded ? "2026-11-05T00:00:00Z" : null,
    snapshot: { version: 1, capturedAt: "", tasks: [{ ...task, slot: 1, prNumber: 999 }, { ...task, prNumber }] },
  });

  it("uses the current attempt's task in the source's slot and the student's email", async () => {
    const { db, filters } = fakeDb([
      { task_slot: 2, course_id: "c", user_id: "u", cse_assignment_submissions: submission(3, true, 300) },
      { task_slot: 2, course_id: "c", user_id: "u", cse_assignment_submissions: submission(2, false, 115) },
    ], "jdoe@ucsc.edu");
    const source = await loadRebuildSource(db, captured.instance_id);
    expect(source.task.prNumber).toBe(115);
    expect([source.assignmentNumber, source.attempt, source.studentEmail]).toEqual([2, 2, "jdoe@ucsc.edu"]);
    expect(filters).toEqual(["cse_benchmark_task_sources.instance_id=JoKHerre__Bookworm-COL-04-T-4", "cse_course_memberships.course_id=c", "cse_course_memberships.user_id=u", "select ucsc_email"]);
  });

  it("fails clearly when the instance has no source row", async () => {
    await expect(loadRebuildSource(fakeDb([], null).db, "x-1")).rejects.toThrow("x-1: no cse_benchmark_task_sources row with a submission");
  });
});

describe("write-back of a rebuilt row", () => {
  const rebuiltRow = async () => (await rebuild(SPEC + CODE + TESTS).result).row;
  const validatedFrom = (row: TaskRow): ValidationResult => ({
    ...rejectedWithoutRun(row, "env_error", ""), validation_status: "validated", reason: null, detail: null,
    FAIL_TO_PASS: ["server/backend_tests/ratings.test.ts::averages ratings"], PASS_TO_PASS: [], image: "node:24-bookworm", eval_script: "set -e\n", log_parser: "vitest-json",
  });
  const normalRow: TaskRow = { instance_id: "o__r-1", repo: "o/r", base_commit: "c", patch: "p", test_patch: "t", FAIL_TO_PASS: [], PASS_TO_PASS: [] };

  function fakeClient(existingFlags: string[]) {
    const calls: Array<{ table: string; kind: string; values?: Record<string, unknown> }> = [];
    const client: WritebackClient = {
      from(table) {
        return {
          select() { return { eq: async () => { calls.push({ table, kind: "select" }); return { data: [{ flags: existingFlags }], error: null }; } }; },
          update(values) { return { eq: async () => { calls.push({ table, kind: "update", values }); return { error: null }; } }; },
        };
      },
    };
    return { client, calls };
  }

  it("client path: sets the rebuilt base and patches with the verified lists, and adds the staff flag once", async () => {
    const row = await rebuiltRow();
    const { client, calls } = fakeClient(["no_source_patch"]);
    const lines = await applyWriteback(client, writebackPlan([validatedFrom(row)]), () => "now");
    expect(calls[0]).toEqual({ table: "cse_benchmark_tasks", kind: "update", values: {
      FAIL_TO_PASS: ["server/backend_tests/ratings.test.ts::averages ratings"], PASS_TO_PASS: [], image: "node:24-bookworm", eval_script: "set -e\n", log_parser: "vitest-json",
      base_commit: PARENT, environment_setup_commit: PARENT, patch: row.patch, test_patch: row.test_patch,
    } });
    expect(calls[2]!.values).toEqual({ validation_status: "validated", flags: ["no_source_patch", STAFF_REBUILT_FLAG], updated_at: "now" });
    expect(lines[0]).toContain(`rebuilt base ${PARENT.slice(0, 7)} and patches written, flagged ${STAFF_REBUILT_FLAG}`);
    // Written back a second time (a rerun): the flag is not duplicated.
    const again = fakeClient(["no_source_patch", STAFF_REBUILT_FLAG]);
    await applyWriteback(again.client, writebackPlan([validatedFrom(row)]), () => "now");
    expect(again.calls[2]!.values!.flags).toEqual(["no_source_patch", STAFF_REBUILT_FLAG]);
  });

  it("client path: a rejected rebuilt row still gets its rebuilt base and patches, but no lists", async () => {
    const row = await rebuiltRow();
    const { client, calls } = fakeClient([]);
    await applyWriteback(client, writebackPlan([rejectedWithoutRun(row, "no_fail_to_pass", "")]), () => "now");
    expect(calls[0]).toEqual({ table: "cse_benchmark_tasks", kind: "update", values: { base_commit: PARENT, environment_setup_commit: PARENT, patch: row.patch, test_patch: row.test_patch } });
    expect(calls[2]!.values!.flags).toEqual(["validation_reason:no_fail_to_pass", STAFF_REBUILT_FLAG]);
  });

  it("writeback.sql: the rebuilt row gets the base and patch update and the staff flag", async () => {
    const row = await rebuiltRow();
    const sql = writebackSql([validatedFrom(row)]);
    expect(sql).toContain(`-- rebuilt from merge commit ${M}; original base_commit ${BASE_TAG}`);
    expect(sql).toContain(`   set base_commit = $hecate$${PARENT}$hecate$,\n       environment_setup_commit = $hecate$${PARENT}$hecate$,\n       patch = $hecate$${row.patch}$hecate$,`);
    expect(sql).toContain(`and f <> '${STAFF_REBUILT_FLAG}'), null) || array[$hecate$${STAFF_REBUILT_FLAG}$hecate$],`);
  });

  it("a normal result is written exactly as before, and an env_error result writes nothing (rebuilt or not)", async () => {
    const normal = validatedFrom(normalRow);
    expect(normal.rebuild).toBeUndefined();
    const [op] = writebackPlan([normal]);
    expect(op).toMatchObject({ rebuild: null, flags: [] });
    const { client, calls } = fakeClient(["no_test_patch"]);
    await applyWriteback(client, [op!], () => "now");
    expect(calls[0]!.values).toEqual({ FAIL_TO_PASS: normal.FAIL_TO_PASS, PASS_TO_PASS: [], image: "node:24-bookworm", eval_script: "set -e\n", log_parser: "vitest-json" });
    expect(calls[2]!.values!.flags).toEqual(["no_test_patch"]);
    const sql = writebackSql([normal]);
    expect(sql).not.toContain("base_commit");
    expect(sql).not.toContain(STAFF_REBUILT_FLAG);

    const crashed = rejectedWithoutRun(await rebuiltRow(), "env_error", "docker died");
    expect(crashed.rebuild?.base_commit).toBe(PARENT);
    expect(writebackPlan([crashed])).toEqual([]);
    expect(writebackSql([crashed])).not.toContain("update public.cse_benchmark_tasks");
  });
});
