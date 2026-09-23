/**
 * Per-language aggregates for mixed repos. Cyclomatic rules differ by
 * language (JS counts `else`, Python does not), so pooled averages are only
 * meaningful next to these splits.
 */

import { HIGH_COMPLEXITY_THRESHOLD } from "../utils/constants.js";
import type {
  FunctionDetail,
  LanguageBucket,
  LanguageSummary,
  ModuleScopeMetrics,
  PythonMetrics,
  SmellCounts,
} from "../types/report.js";

const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

function emptySmells(): SmellCounts {
  return { longFunctions: 0, deepNesting: 0, longParameterLists: 0, emptyCatchBlocks: 0, consoleLogs: 0 };
}

interface Bucket {
  files: number;
  sourceLOC: number;
  testLOC: number;
  complexities: number[];
  lengths: number[];
  smells: SmellCounts;
}

export class LanguageSummaryBuilder {
  private readonly buckets = new Map<LanguageBucket, Bucket>();

  add(
    bucket: LanguageBucket,
    file: { loc: number; isTest: boolean; functions: FunctionDetail[]; smells: SmellCounts },
  ): void {
    let b = this.buckets.get(bucket);
    if (!b) {
      b = { files: 0, sourceLOC: 0, testLOC: 0, complexities: [], lengths: [], smells: emptySmells() };
      this.buckets.set(bucket, b);
    }
    b.files++;
    if (file.isTest) b.testLOC += file.loc;
    else b.sourceLOC += file.loc;
    for (const f of file.functions) {
      b.complexities.push(f.cyclomaticComplexity);
      b.lengths.push(f.lines);
    }
    for (const key of Object.keys(b.smells) as (keyof SmellCounts)[]) {
      b.smells[key] += file.smells[key];
    }
  }

  build(): Partial<Record<LanguageBucket, LanguageSummary>> {
    const out: Partial<Record<LanguageBucket, LanguageSummary>> = {};
    for (const [bucket, b] of this.buckets) {
      const n = b.complexities.length;
      out[bucket] = {
        files: b.files,
        sourceLOC: b.sourceLOC,
        testLOC: b.testLOC,
        functions: n,
        averageComplexity: n > 0 ? round1(b.complexities.reduce((a, c) => a + c, 0) / n) : 0,
        maxComplexity: n > 0 ? Math.max(...b.complexities) : 0,
        highComplexityFunctions: b.complexities.filter((c) => c > HIGH_COMPLEXITY_THRESHOLD).length,
        averageFunctionLength: n > 0 ? round1(b.lengths.reduce((a, c) => a + c, 0) / n) : 0,
        smells: b.smells,
      };
    }
    return out;
  }
}

export class PythonMetricsBuilder {
  private files = 0;
  private defs = 0;
  private withReturn = 0;
  private params = 0;
  private typedParams = 0;
  private readonly moduleScopes: ModuleScopeMetrics[] = [];

  addFile(functions: FunctionDetail[], moduleScope: ModuleScopeMetrics | null): void {
    this.files++;
    for (const f of functions) {
      if (f.typedParameterCount === undefined) continue;
      this.defs++;
      if (f.hasReturnAnnotation) this.withReturn++;
      this.params += f.parameterCount;
      this.typedParams += f.typedParameterCount;
    }
    if (moduleScope) this.moduleScopes.push(moduleScope);
  }

  build(): PythonMetrics | undefined {
    if (this.files === 0) return undefined;
    const cc = this.moduleScopes.map((m) => m.cyclomaticComplexity);
    return {
      typeHints: {
        functions: this.defs,
        functionsWithReturnAnnotation: this.withReturn,
        parameters: this.params,
        typedParameters: this.typedParams,
        parameterCoverage: this.params > 0 ? round3(this.typedParams / this.params) : null,
        returnCoverage: this.defs > 0 ? round3(this.withReturn / this.defs) : null,
      },
      moduleScope: {
        filesWithTopLevelCode: this.moduleScopes.length,
        topLevelLines: this.moduleScopes.reduce((a, m) => a + m.lines, 0),
        maxComplexity: cc.length > 0 ? Math.max(...cc) : 0,
        averageComplexity: cc.length > 0 ? round1(cc.reduce((a, c) => a + c, 0) / cc.length) : 0,
      },
    };
  }
}
