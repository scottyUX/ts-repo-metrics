import { describe, expect, it } from "vitest";
import {
  modifiedTests,
  parseVitestReport,
  testBodies,
  unmatchedStaticIds,
  type VitestReport,
} from "@/lib/cse115a/benchmark/validation/testIds";

const report: VitestReport = {
  testResults: [
    {
      name: "/work/tests/US-1-T-1_login_email.test.ts",
      assertionResults: [
        { ancestorTitles: ["US-1-T-1 university email check"], title: "US-1-T-1 rejects a non-university email", status: "failed" },
        { ancestorTitles: ["US-1-T-1 university email check"], title: "US-1-T-1 accepts a ucsc.edu email in any case", status: "passed" },
        { ancestorTitles: [], title: "top-level test", status: "pending" },
      ],
    },
    { name: "/work/tests/smoke.test.ts", assertionResults: [{ ancestorTitles: ["existing behavior"], title: "accepts a ucsc.edu email", status: "todo" }] },
  ],
};

describe("parseVitestReport", () => {
  it("builds file::describe > test ids with the mount prefix stripped", () => {
    const results = parseVitestReport(report);
    expect(results).toEqual({
      "tests/US-1-T-1_login_email.test.ts::US-1-T-1 university email check > US-1-T-1 rejects a non-university email": "failed",
      "tests/US-1-T-1_login_email.test.ts::US-1-T-1 university email check > US-1-T-1 accepts a ucsc.edu email in any case": "passed",
      "tests/US-1-T-1_login_email.test.ts::top-level test": "skipped",
      "tests/smoke.test.ts::existing behavior > accepts a ucsc.edu email": "skipped",
    });
  });

  it("leaves paths alone when they do not start with the mount prefix", () => {
    const results = parseVitestReport({ testResults: [{ name: "tests/a.test.ts", assertionResults: [{ ancestorTitles: [], title: "x", status: "passed" }] }] });
    expect(Object.keys(results)).toEqual(["tests/a.test.ts::x"]);
  });

  it("reads an empty report as no results (a file that failed to load reports nothing)", () => {
    expect(parseVitestReport({ testResults: [] })).toEqual({});
  });

  it("reads Jest's --json report: pending and todo are skips, a suite that failed to run is a load failure", () => {
    // Trimmed from `jest --ci --json` (Jest 29.7.0) on a two-file scratch project.
    const jest: VitestReport = {
      testResults: [
        {
          name: "/work/tests/broken.test.js",
          status: "failed",
          message: "  ● Test suite failed to run\n\n    Cannot find module './does-not-exist' from 'tests/broken.test.js'",
          assertionResults: [],
        },
        {
          name: "/work/tests/sum.test.js",
          status: "failed",
          message: "  ● sum › fails\n\n    expect(received).toBe(expected) // Object.is equality",
          assertionResults: [
            { ancestorTitles: ["sum", "nested"], title: "adds", status: "passed" },
            { ancestorTitles: ["sum"], title: "fails", status: "failed" },
            { ancestorTitles: ["sum"], title: "skipped one", status: "pending" },
            { ancestorTitles: ["sum"], title: "later", status: "todo" },
          ],
        },
      ],
    };
    expect(parseVitestReport(jest)).toEqual({
      "tests/broken.test.js::(load)": "failed",
      "tests/sum.test.js::sum > nested > adds": "passed",
      "tests/sum.test.js::sum > fails": "failed",
      "tests/sum.test.js::sum > skipped one": "skipped",
      "tests/sum.test.js::sum > later": "skipped",
    });
  });

  it("maps Jest's disabled to skipped and focused to passed", () => {
    const results = parseVitestReport({ testResults: [{ name: "a.test.js", assertionResults: [
      { ancestorTitles: [], title: "off", status: "disabled" },
      { ancestorTitles: [], title: "only", status: "focused" },
    ] }] });
    expect(results).toEqual({ "a.test.js::off": "skipped", "a.test.js::only": "passed" });
  });
});

describe("unmatchedStaticIds", () => {
  it("lists static ids no run reported", () => {
    const runs = [parseVitestReport(report)];
    expect(unmatchedStaticIds(["tests/smoke.test.ts::existing behavior > accepts a ucsc.edu email", "tests/a.test.ts::missing"], runs)).toEqual(["tests/a.test.ts::missing"]);
  });
});

const baseFile = `
import { describe, it, expect } from "vitest";
describe("login", () => {
  it("accepts a ucsc.edu email", () => {
    expect(login("a@ucsc.edu").ok).toBe(true);
  });
  it.skip("rejects an empty email", () => {
    expect(login("").ok).toBe(false);
  });
  describe("nested", () => {
    test("deep", () => {});
  });
});
it("top-level", () => {});
`;

describe("testBodies", () => {
  it("keys every test by file::describe > test and keeps the call's source text", () => {
    const bodies = testBodies("tests/login.test.ts", baseFile);
    expect([...bodies.keys()]).toEqual([
      "tests/login.test.ts::login > accepts a ucsc.edu email",
      "tests/login.test.ts::login > rejects an empty email",
      "tests/login.test.ts::login > nested > deep",
      "tests/login.test.ts::top-level",
    ]);
    expect(bodies.get("tests/login.test.ts::login > nested > deep")).toBe('test("deep", () => {})');
  });

  it("ignores tests whose name is not a plain string", () => {
    const bodies = testBodies("t.test.ts", 'const n = "x"; it(n, () => {}); it(`a ${n}`, () => {}); it("ok", () => {});');
    expect([...bodies.keys()]).toEqual(["t.test.ts::ok"]);
  });
});

describe("modifiedTests", () => {
  it("lists a pre-existing test whose body changed and nothing else", () => {
    const patched = baseFile.replace('expect(login("a@ucsc.edu").ok).toBe(true);', 'expect(login("a@UCSC.edu").ok).toBe(true);');
    expect(modifiedTests("tests/login.test.ts", baseFile, patched)).toEqual(["tests/login.test.ts::login > accepts a ucsc.edu email"]);
  });

  it("does not list new tests, removed tests, or untouched tests", () => {
    const patched = baseFile.replace('it("top-level", () => {});', 'it("brand new", () => {});');
    expect(modifiedTests("tests/login.test.ts", baseFile, patched)).toEqual([]);
  });

  it("treats a changed import at the top of the file as touching no test", () => {
    const patched = 'import { session } from "./session";\n' + baseFile;
    expect(modifiedTests("tests/login.test.ts", baseFile, patched)).toEqual([]);
  });

  it("counts an unskipped test as modified (the call text changed)", () => {
    const patched = baseFile.replace('it.skip("rejects an empty email"', 'it("rejects an empty email"');
    expect(modifiedTests("tests/login.test.ts", baseFile, patched)).toEqual(["tests/login.test.ts::login > rejects an empty email"]);
  });
});

describe("parseVitestReport: a file that failed to load", () => {
  it("reports the load pseudo-id when a file failed with no assertion results", () => {
    const report = { testResults: [{ name: "/work/src/broken.test.ts", status: "failed", assertionResults: [] }] };
    expect(parseVitestReport(report)).toEqual({ "src/broken.test.ts::(load)": "failed" });
  });
});
