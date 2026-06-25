import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  pairedTestPathCandidates,
  escapeRegExp,
  symbolReferencedInSource,
  computeSymbolVerificationRisks,
} from "../src/extract/symbolVerificationRisk.js";
import type { PerFileEntry, FunctionDetail } from "../src/types/report.js";

describe("pairedTestPathCandidates", () => {
  it("prefers colocated .test then .spec then __tests__ variants", () => {
    const c = pairedTestPathCandidates("src/foo.ts");
    expect(c[0]).toBe("src/foo.test.ts");
    expect(c[1]).toBe("src/foo.spec.ts");
    expect(c).toContain("src/__tests__/foo.ts");
    expect(c).toContain("src/__tests__/foo.test.ts");
  });

  it("uses tsx extension for tsx sources", () => {
    const c = pairedTestPathCandidates("app/Bar.tsx");
    expect(c[0]).toBe("app/Bar.test.tsx");
  });

  it("uses js extension for js sources", () => {
    const c = pairedTestPathCandidates("src/foo.js");
    expect(c[0]).toBe("src/foo.test.js");
    expect(c[1]).toBe("src/foo.spec.js");
  });

  it("uses jsx extension for jsx sources", () => {
    const c = pairedTestPathCandidates("components/Hello.jsx");
    expect(c[0]).toBe("components/Hello.test.jsx");
  });
});

describe("symbolReferencedInSource", () => {
  it("detects whole-word identifier", () => {
    expect(symbolReferencedInSource("foo", " foo(1)")).toBe(true);
    expect(symbolReferencedInSource("foo", "foobar")).toBe(false);
  });

  it("escapes regex metacharacters in symbol name", () => {
    expect(symbolReferencedInSource("a.b", "a.b")).toBe(true);
  });
});

describe("escapeRegExp", () => {
  it("escapes special chars", () => {
    expect(escapeRegExp("foo.bar")).toBe("foo\\.bar");
  });
});

function minimalFunction(name: string, line: number, cc: number): FunctionDetail {
  const zeroHalstead = {
    n1: 0,
    n2: 0,
    N1: 0,
    N2: 0,
    volume: 0,
    difficulty: 0,
    effort: 0,
  };
  return {
    name,
    type: "function_declaration",
    startLine: line,
    lines: 5,
    maxNestingDepth: 1,
    parameterCount: 0,
    cyclomaticComplexity: cc,
    halstead: zeroHalstead,
    cognitiveComplexity: 1,
    maintainabilityIndexGradAiRaw: 0,
    maintainabilityIndexGradAiNorm: 0,
    isReactComponent: false,
    isMonolithic: false,
  };
}

describe("computeSymbolVerificationRisks", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  it("infers referenced_in_test vs paired_file_only vs none", async () => {
    const tmp = path.join(__dirname, "tmp-symbol-risk");
    await rm(tmp, { recursive: true, force: true });
    await mkdir(path.join(tmp, "src"), { recursive: true });

    await writeFile(
      path.join(tmp, "src", "math.ts"),
      `export function risky(a: number): number {
  if (a < 0) return 0;
  return a * 2;
}
`,
      "utf8",
    );
    await writeFile(
      path.join(tmp, "src", "math.test.ts"),
      `import { risky } from "./math";
test("r", () => expect(risky(1)).toBe(2));
`,
      "utf8",
    );

    const perFile: PerFileEntry[] = [
      {
        file: "src/math.ts",
        functions: 1,
        functionsByType: {},
        functionMetrics: [minimalFunction("risky", 1, 8)],
        complexity: [{ name: "risky", type: "function_declaration", startLine: 1, complexity: 8 }],
      },
    ];

    const rows = await computeSymbolVerificationRisks(tmp, perFile);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.evidence).toBe("referenced_in_test");
    expect(rows[0]!.verificationScore).toBe(1);
    expect(rows[0]!.pairedTestPath).toBe("src/math.test.ts");

    await rm(tmp, { recursive: true, force: true });
  });
});
