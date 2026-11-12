import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkInstance } from "@/lib/cse115a/benchmark/buildInstance";
import type { ExportCandidate } from "@/lib/cse115a/benchmark/exportJsonl";
import { harborExport, NO_RECIPE_REASON } from "@/lib/cse115a/benchmark/exportHarbor";
import { PRIVATE_REPO_REASON, type HarborEnv } from "@/lib/cse115a/benchmark/validation/harbor";

const state = vi.hoisted(() => ({ approved: false, candidates: [] as unknown[] }));

vi.mock("@/lib/cse115a/consent", () => ({ get CONSENT_APPROVED() { return state.approved; } }));
vi.mock("@/lib/supabase/server", () => ({ getSupabase: vi.fn(() => ({})) }));
vi.mock("@/lib/cse115a/instructorApi", () => ({ guardCourse: vi.fn(async () => ({ identity: {}, course: { id: "course-1", slug: "cse115a-f26" } })) }));
vi.mock("@/lib/cse115a/benchmark/loadCourseBenchmark", () => ({ loadExportCandidates: vi.fn(async () => state.candidates) }));

const SHA = "28e92a1c0ffee0000000000000000000000000ab";
const recipe: HarborEnv = {
  image: "node:24-bookworm@sha256:8fa9", runners: ["vitest"], package_dir: "", install_steps: [{ cwd: "", command: "npm ci" }],
  test_steps: [{ kind: "vitest", command: "npx vitest run --reporter=json --outputFile=$REPORT_DIR/vitest-0.json --passWithNoTests" }],
  env: { CI: "true" }, services: [], node_source: "default",
};

/** `"omit"`: a row read before the column existed, with no harbor_env key at all. */
function instance(id: string, harbor_env: HarborEnv | null | "omit" = recipe): BenchmarkInstance {
  return {
    instance_id: id, repo: "team/app", base_commit: SHA, environment_setup_commit: SHA, created_at: "2026-10-01T00:00:00Z", version: "sprint-2",
    problem_statement: `# ${id}`, hints_text: "", patch: "diff --git a/src/a.ts b/src/a.ts\n", test_patch: "diff --git a/src/a.test.ts b/src/a.test.ts\n",
    FAIL_TO_PASS: ["src/a.test.ts::adds"], PASS_TO_PASS: [], eval_type: "pass_and_fail", image: recipe.image, eval_script: "", log_parser: "vitest-json",
    difficulty: null, repo_metrics: null, ...(harbor_env === "omit" ? {} : { harbor_env }),
  };
}
const candidate = (inst: BenchmarkInstance, consented: boolean, status: "candidate" | "validated" | "rejected"): ExportCandidate =>
  ({ instance: inst, sources: [{ consented, validationStatus: status }] });

const CANDIDATES: ExportCandidate[] = [
  candidate(instance("team__app-ok-1"), true, "validated"),
  candidate(instance("team__app-noconsent-1"), false, "validated"),
  candidate(instance("team__app-candidate-1"), true, "candidate"),
  candidate(instance("team__app-rejected-1"), true, "rejected"),
  candidate(instance("team__app-norecipe-1", null), true, "validated"),
  candidate(instance("team__app-oldrow-1", "omit"), true, "validated"),
  candidate(instance("team__app-db-1", { ...recipe, services: [{ name: "postgres", image: "postgres:16" }] }), true, "validated"),
];

describe("harborExport", () => {
  const out = harborExport(CANDIDATES);

  it("exports consented, validated rows with a recipe, one folder each, fetching from GitHub", () => {
    expect(out.exported).toEqual(["team__app-ok-1"]);
    const folders = new Set([...out.files.keys()].map((p) => p.split("/")[0]));
    expect(folders).toEqual(new Set(["team__app-ok-1", "SKIPPED.txt"]));
    const dockerfile = out.files.get("team__app-ok-1/environment/Dockerfile")!;
    expect(dockerfile).toContain(`git -C /app fetch -q --depth 1 https://github.com/team/app.git ${SHA}`);
    expect(dockerfile).not.toContain("COPY");
    expect(out.files.has("team__app-ok-1/tests/check.mjs")).toBe(true);
  });

  it("leaves out unconsented, candidate and rejected rows without listing them", () => {
    const listed = out.files.get("SKIPPED.txt")!;
    for (const id of ["noconsent", "candidate", "rejected"]) {
      expect([...out.files.keys()].some((p) => p.includes(`-${id}-1`))).toBe(false);
      expect(listed).not.toContain(`-${id}-1`);
    }
  });

  it("lists validated, consented rows Harbor cannot express in SKIPPED.txt with the reason", () => {
    expect(out.skipped).toEqual([
      { instance_id: "team__app-db-1", reason: "Harbor export for rows with a database service is not built yet" },
      { instance_id: "team__app-norecipe-1", reason: NO_RECIPE_REASON },
      { instance_id: "team__app-oldrow-1", reason: NO_RECIPE_REASON },
    ]);
    expect(out.files.get("SKIPPED.txt")).toBe([
      "# Validated, consented rows left out of this export, with the reason.",
      "team__app-db-1\tHarbor export for rows with a database service is not built yet",
      `team__app-norecipe-1\t${NO_RECIPE_REASON}`,
      `team__app-oldrow-1\t${NO_RECIPE_REASON}`,
      "",
    ].join("\n"));
  });

  it("writes no SKIPPED.txt when nothing was skipped", () => {
    expect(harborExport([CANDIDATES[0]!]).files.has("SKIPPED.txt")).toBe(false);
  });
});

describe("GET benchmark-harbor.zip", () => {
  beforeEach(() => {
    state.approved = false;
    state.candidates = CANDIDATES;
  });
  const call = async () => {
    const { GET } = await import("@/app/api/cse115a/instructor/courses/[slug]/benchmark-harbor.zip/route");
    return GET(new Request("http://localhost/api/cse115a/instructor/courses/cse115a-f26/benchmark-harbor.zip"), { params: Promise.resolve({ slug: "cse115a-f26" }) });
  };

  it("is 409 while CONSENT_APPROVED is false", async () => {
    const response = await call();
    expect(response.status).toBe(409);
  });

  it("returns the zip, with executable scripts, when export is on", async () => {
    state.approved = true;
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="cse115a-f26-harbor-validated.zip"');
    const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain("team__app-ok-1/tests/test.sh");
    expect(names).toContain("SKIPPED.txt");
    expect((zip.getEntry("team__app-ok-1/tests/test.sh")!.attr >>> 16) & 0o777).toBe(0o755);
    expect((zip.getEntry("team__app-ok-1/task.toml")!.attr >>> 16) & 0o777).toBe(0o644);
    expect(zip.readAsText("team__app-ok-1/tests/expected.json")).toContain("src/a.test.ts::adds");
  });
});

describe("harborExport, private repositories", () => {
  const privateRow = candidate(instance("team__app-private-1", { ...recipe, repo_public: false }), true, "validated");
  const publicRow = candidate(instance("team__app-public-1", { ...recipe, repo_public: true }), true, "validated");
  const out = harborExport([CANDIDATES[0]!, privateRow, publicRow]);

  it("leaves out a row whose repository the batch found private and lists it in SKIPPED.txt", () => {
    expect(out.exported).toEqual(["team__app-ok-1", "team__app-public-1"]);
    expect([...out.files.keys()].some((p) => p.startsWith("team__app-private-1/"))).toBe(false);
    expect(out.skipped).toEqual([{ instance_id: "team__app-private-1", reason: PRIVATE_REPO_REASON }]);
    expect(out.files.get("SKIPPED.txt")).toContain("team__app-private-1\trepository is private; the task can only be built from a snapshot\n");
  });

  it("exports rows with repo_public true or absent as before", () => {
    const unchecked = harborExport([CANDIDATES[0]!]).files;
    const checked = harborExport([candidate(instance("team__app-ok-1", { ...recipe, repo_public: true }), true, "validated")]).files;
    expect([...checked.keys()]).toEqual([...unchecked.keys()]);
    for (const [path, text] of unchecked) expect(checked.get(path)).toBe(text);
  });
});
