// #454: validateBenchmarkBatch.ts measures fix coverage by default. --no-fix-coverage turns it off; --fix-coverage is
// still accepted and changes nothing; --fix-coverage-only is unchanged. Only the command line is read here: nothing
// runs Docker, clones, or reaches GitHub or Supabase. File names are made up.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "@/scripts/validateBenchmarkBatch";

const base = ["rows.json", "--out", "batch-out"];
const parse = (...flags: string[]) => parseArgs([...base, ...flags]);

describe("#454 fix coverage on by default", () => {
  it("a normal run measures fix coverage without any flag", () => {
    expect(parse().fixCoverage).toBe(true);
    expect(parse("--gold-check", "--snapshots", "--redo").fixCoverage).toBe(true);
  });

  it("--no-fix-coverage turns it off", () => {
    expect(parse("--no-fix-coverage").fixCoverage).toBe(false);
    expect(parse("--no-fix-coverage", "--gold-check").fixCoverage).toBe(false);
  });

  it("--fix-coverage is still accepted and changes nothing", () => {
    expect(parse("--fix-coverage")).toEqual(parse());
    expect(parse("--fix-coverage", "--gold-check")).toEqual(parse("--gold-check"));
  });

  it("--fix-coverage-only is unchanged: it alone runs, no per-row run after a validation, and its old refusals stand", () => {
    const only = parse("--fix-coverage-only", "--only", "T-1,T-2");
    expect(only.fixCoverageOnly).toBe(true);
    expect(only.fixCoverage).toBe(false);
    expect(only.only).toEqual(["T-1", "T-2"]);
    expect(() => parse("--fix-coverage-only", "--fix-coverage")).toThrow("--fix-coverage and --fix-coverage-only do not go together: --fix-coverage-only already runs the coverage run");
    for (const other of ["--snapshots", "--snapshot-only", "--redo", "--gold-check", "--gold-only"]) {
      expect(() => parse("--fix-coverage-only", other)).toThrow("--fix-coverage-only runs only the coverage run on existing results");
    }
  });

  it("--snapshot-only and --gold-only validate nothing, so they measure nothing, and still refuse an explicit --fix-coverage", () => {
    expect(parse("--snapshot-only").fixCoverage).toBe(false);
    expect(parse("--gold-only").fixCoverage).toBe(false);
    expect(parse("--snapshot-only", "--no-fix-coverage").fixCoverage).toBe(false);
    for (const mode of ["--snapshot-only", "--gold-only"]) {
      expect(() => parse(mode, "--fix-coverage")).toThrow("--fix-coverage runs after a validation, so it does not go with --snapshot-only or --gold-only");
    }
  });

  it("contradictory flags are refused", () => {
    expect(() => parse("--fix-coverage", "--no-fix-coverage")).toThrow("--fix-coverage and --no-fix-coverage do not go together");
    expect(() => parse("--no-fix-coverage", "--fix-coverage-only")).toThrow("--no-fix-coverage and --fix-coverage-only do not go together");
  });

  it("the other options read as before", () => {
    expect(parse("--timeout", "60", "--gold-timeout", "30", "--snapshots-from", "older")).toMatchObject({ rowsPath: "rows.json", out: "batch-out", timeoutSeconds: 60, goldTimeoutSeconds: 30, snapshotsFrom: "older" });
    expect(() => parseArgs(["rows.json"])).toThrow("Usage: validateBenchmarkBatch.ts ROWS.json --out DIR");
    expect(() => parse("--bogus")).toThrow("Unexpected argument: --bogus");
  });

  it("the run loop reads fixCoverage, the usage line and header name --no-fix-coverage, and the docs say it is on by default", () => {
    const script = readFileSync(path.resolve(__dirname, "../scripts/validateBenchmarkBatch.ts"), "utf8");
    expect(script).toContain("if (args.fixCoverage && result.validation_status === \"validated\") {");
    expect(script.match(/\[--no-fix-coverage \| --fix-coverage-only\]/g)).toHaveLength(2);
    expect(script).toContain("// Fix coverage (on by default since #454)");
    expect(script).toContain("--no-fix-coverage turns it off");
    expect(script).toContain("if (process.argv[1]?.endsWith(\"validateBenchmarkBatch.ts\")) {");
    const docs = readFileSync(path.resolve(__dirname, "../../../docs/CSE115A_BENCHMARK_VALIDATION.md"), "utf8");
    expect(docs).toContain("it is on by default since #454. `--no-fix-coverage` turns it off");
    expect(docs).toContain("`--fix-coverage`, which turned it on\nbefore #454, is still accepted and changes nothing");
  });
});
