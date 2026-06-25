/**
 * Repository analysis pipeline.
 *
 * Orchestrates the end-to-end flow: profiles the repo (LOC and file counts),
 * discovers source files, reads each one, parses it with Tree-sitter, and
 * runs every registered extractor. Returns a JSON-serializable report.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSourceFiles } from "../collect/fileDiscovery.js";
import { profileRepo } from "../collect/loc.js";
import { detectDuplication } from "../collect/duplication.js";
import { computeWeightedRedundancy } from "../collect/weightedRedundancy.js";
import { extractGitMetrics } from "../collect/gitMetrics.js";
import { extractGitHistoryBundle } from "../collect/gitMetricsV2.js";
import { detectFramework } from "../collect/frameworkDetection.js";
import { detectUnsupportedPythonFramework } from "../collect/pythonFrameworkDetection.js";
import { parseSource } from "../parsing/sourceParser.js";
import { countFunctions } from "../extract/functionCount.js";
import { extractFunctionMetrics } from "../extract/functionMetrics.js";
import { summarizeComplexity } from "../extract/complexity.js";
import { detectSmells } from "../extract/smells.js";
import { computeTestCoverageProxy } from "../extract/testCoverageProxy.js";
import { computeMaintainabilityIndex } from "../extract/maintainabilityIndex.js";
import { computeDistributions } from "../extract/distributions.js";
import {
  extractReactMetricsFromTsx,
  mergeReactMetricsReports,
} from "../extract/react/extractReactMetrics.js";
import { extractSilentFailures } from "../extract/silentFailures.js";
import { computeSymbolVerificationRisks } from "../extract/symbolVerificationRisk.js";
import { LONG_FUNCTION_THRESHOLD, isJsxPath, sourceFlavorForPath } from "../utils/constants.js";
import { languageProfileForPath } from "../utils/languageProfile.js";
import { median } from "../utils/math.js";
import { getSourceMetadata } from "../collect/repoMetadata.js";
import type {
  RepoReport,
  RepoProfile,
  FunctionDetail,
  FunctionMetricsSummary,
  FunctionComplexity,
  SmellCounts,
  PerFileEntry,
  SourceInfo,
  ReactComponentMetrics,
  Phase3Metrics,
  SilentFailureEvent,
  UnsupportedFrameworkInfo,
} from "../types/report.js";

function flavorForFile(filePath: string) {
  return sourceFlavorForPath(filePath);
}

export interface AnalyzeOptions {
  /** Pre-computed source metadata. If omitted, computed from repo path. */
  source?: SourceInfo;
}

const EMPTY_PROFILE: RepoProfile = {
  totalFiles: 0,
  tsFiles: 0,
  tsxFiles: 0,
  jsFiles: 0,
  jsxFiles: 0,
  pyFiles: 0,
  testFiles: 0,
  totalLOC: 0,
  sourceLOC: 0,
  testLOC: 0,
};

const EMPTY_SMELLS: SmellCounts = {
  longFunctions: 0,
  deepNesting: 0,
  longParameterLists: 0,
  emptyCatchBlocks: 0,
  consoleLogs: 0,
};

async function readAnalyzerVersion(): Promise<string | undefined> {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const packageRoot = path.join(__dirname, "..", "..");
    const pkgPath = path.join(packageRoot, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

async function buildSkippedFrameworkReport(
  repoPath: string,
  source: SourceInfo,
  analysisSkipped: UnsupportedFrameworkInfo,
): Promise<RepoReport> {
  const git = await extractGitMetrics(repoPath);
  const gitBundle = await extractGitHistoryBundle(repoPath);
  const gitMetricsV2 = gitBundle?.gitMetricsV2 ?? null;
  const contributors = gitBundle?.contributors;
  const framework = await detectFramework(repoPath);
  const analyzer_version = await readAnalyzerVersion();
  const functionMetricsSummary: FunctionMetricsSummary = {
    totalFunctions: 0,
    averageLength: 0,
    medianLength: 0,
    maxNestingDepth: 0,
    longFunctionPercentage: 0,
  };
  const complexitySummary = summarizeComplexity([]);
  const maintainability = computeMaintainabilityIndex(0, 0, 0);
  const testCoverageProxy = computeTestCoverageProxy(EMPTY_PROFILE);
  const distributions = computeDistributions([], [], []);
  const phase3: Phase3Metrics = {
    sfd: 0,
    mcr: null,
    srs: 0,
    silentFailureEvents: [],
    srsWeightedNumerator: 0,
    srsExactWeightedLines: 0,
    srsNearWeightedLines: 0,
    monolithicComponentCount: 0,
    reactComponentCount: 0,
  };

  return {
    repoPath,
    source,
    filesAnalyzed: 0,
    analysisSkipped,
    analyzer_version,
    analysis_timestamp: new Date().toISOString(),
    distributions,
    profile: EMPTY_PROFILE,
    totals: { functions: 0 },
    functionMetricsSummary,
    complexity: complexitySummary,
    smells: EMPTY_SMELLS,
    maintainability,
    testCoverageProxy,
    duplication: null,
    git,
    gitMetricsV2,
    ...(contributors && contributors.length > 0 ? { contributors } : {}),
    framework,
    perFile: [],
    phase3,
    symbolVerificationRisks: [],
  };
}

/**
 * Run the full analysis pipeline on a repository.
 *
 * @param repoPath - Absolute path to the repository root.
 * @param options - Optional source metadata (for cloned repos).
 * @returns A JSON-serializable report with aggregate totals and per-file breakdowns.
 */
export async function analyzeRepo(
  repoPath: string,
  options?: AnalyzeOptions,
): Promise<RepoReport> {
  const source =
    options?.source ??
    (await getSourceMetadata(repoPath, "local", ""));

  const unsupportedFramework = await detectUnsupportedPythonFramework(repoPath);
  if (unsupportedFramework) {
    return buildSkippedFrameworkReport(repoPath, source, unsupportedFramework);
  }

  const profile = await profileRepo(repoPath);
  const files = await discoverSourceFiles(repoPath);

  let totalFunctions = 0;
  const allFunctionDetails: FunctionDetail[] = [];
  const allComplexities: FunctionComplexity[] = [];
  const totalSmells: SmellCounts = {
    longFunctions: 0,
    deepNesting: 0,
    longParameterLists: 0,
    emptyCatchBlocks: 0,
    consoleLogs: 0,
  };
  const perFile: PerFileEntry[] = [];
  let filesSkipped = 0;
  const reactMetricsByFile: ReactComponentMetrics[][] = [];
  let tsxFilesAnalyzed = 0;
  const silentFailureEvents: SilentFailureEvent[] = [];

  for (const filePath of files) {
    let code: string;
    try {
      code = await readFile(filePath, "utf8");
    } catch {
      console.error(`Skipping ${path.relative(repoPath, filePath)}: could not read file`);
      filesSkipped++;
      continue;
    }

    let tree;
    try {
      tree = parseSource(code, flavorForFile(filePath));
    } catch (err) {
      console.error(`Skipping ${path.relative(repoPath, filePath)}: parse error`, err instanceof Error ? err.message : err);
      filesSkipped++;
      continue;
    }

    const langProfile = languageProfileForPath(filePath);
    const fnCount = countFunctions(tree.rootNode, langProfile);
    const relFile = path.relative(repoPath, filePath);
    const fnMetrics = extractFunctionMetrics(tree.rootNode, {
      relativeFilePath: relFile,
      profile: langProfile,
    });
    const fileComplexity: FunctionComplexity[] = fnMetrics.functions.map(
      (f) => ({
        name: f.name,
        type: f.type,
        startLine: f.startLine,
        complexity: f.cyclomaticComplexity,
      }),
    );
    const fileSmells = detectSmells(tree.rootNode, langProfile);

    totalFunctions += fnCount.total;
    allFunctionDetails.push(...fnMetrics.functions);
    allComplexities.push(...fileComplexity);

    for (const key of Object.keys(totalSmells) as (keyof SmellCounts)[]) {
      totalSmells[key] += fileSmells[key];
    }

    perFile.push({
      file: path.relative(repoPath, filePath),
      functions: fnCount.total,
      functionsByType: fnCount.byType,
      functionMetrics: fnMetrics.functions,
      complexity: fileComplexity,
    });

    if (isJsxPath(filePath)) {
      silentFailureEvents.push(
        ...extractSilentFailures(tree.rootNode, relFile),
      );
      tsxFilesAnalyzed++;
      reactMetricsByFile.push(
        extractReactMetricsFromTsx(tree.rootNode, path.relative(repoPath, filePath)),
      );
    }
  }

  const lengths = allFunctionDetails.map((f) => f.lines).sort((a, b) => a - b);

  const functionMetricsSummary: FunctionMetricsSummary = {
    totalFunctions,
    averageLength: totalFunctions > 0
      ? Math.round((lengths.reduce((a, b) => a + b, 0) / totalFunctions) * 10) / 10
      : 0,
    medianLength: median(lengths),
    maxNestingDepth: allFunctionDetails.reduce((max, f) => Math.max(max, f.maxNestingDepth), 0),
    longFunctionPercentage: totalFunctions > 0
      ? Math.round((allFunctionDetails.filter((f) => f.lines > LONG_FUNCTION_THRESHOLD).length / totalFunctions) * 1000) / 10
      : 0,
  };

  const complexitySummary = summarizeComplexity(allComplexities);
  const distributions = computeDistributions(
    allFunctionDetails,
    allComplexities,
    perFile,
  );
  const maintainability = computeMaintainabilityIndex(
    complexitySummary.average,
    profile.totalLOC,
    functionMetricsSummary.averageLength,
  );
  const testCoverageProxy = computeTestCoverageProxy(profile);
  const duplicationResult = await detectDuplication(repoPath);
  const duplication = duplicationResult?.metrics ?? null;
  const sourceKlocDivisor = profile.sourceLOC / 1000;
  const sfd =
    sourceKlocDivisor > 0
      ? silentFailureEvents.length / sourceKlocDivisor
      : 0;
  const reactComponentCount = allFunctionDetails.filter((f) => f.isReactComponent)
    .length;
  const monolithicComponentCount = allFunctionDetails.filter((f) => f.isMonolithic)
    .length;
  const mcr =
    reactComponentCount === 0
      ? null
      : monolithicComponentCount / reactComponentCount;
  const redundancyWeights = duplicationResult
    ? computeWeightedRedundancy(
        repoPath,
        duplicationResult.duplicates,
        profile.sourceLOC,
      )
    : {
        weightedNumerator: 0,
        srs: 0,
        exactWeightedLines: 0,
        nearWeightedLines: 0,
      };
  const phase3: Phase3Metrics = {
    sfd: Math.round(sfd * 100000) / 100000,
    mcr: mcr === null ? null : Math.round(mcr * 100000) / 100000,
    srs: redundancyWeights.srs,
    silentFailureEvents,
    srsWeightedNumerator: redundancyWeights.weightedNumerator,
    srsExactWeightedLines: redundancyWeights.exactWeightedLines,
    srsNearWeightedLines: redundancyWeights.nearWeightedLines,
    monolithicComponentCount,
    reactComponentCount,
  };
  const git = await extractGitMetrics(repoPath);
  const gitBundle = await extractGitHistoryBundle(repoPath);
  const gitMetricsV2 = gitBundle?.gitMetricsV2 ?? null;
  const contributors = gitBundle?.contributors;
  const framework = await detectFramework(repoPath);

  const analyzer_version = await readAnalyzerVersion();

  const reactMetrics =
    tsxFilesAnalyzed > 0
      ? mergeReactMetricsReports(reactMetricsByFile, tsxFilesAnalyzed)
      : undefined;

  const symbolVerificationRisks = await computeSymbolVerificationRisks(repoPath, perFile);

  return {
    repoPath,
    source,
    filesAnalyzed: perFile.length,
    filesSkipped: filesSkipped > 0 ? filesSkipped : undefined,
    analyzer_version,
    analysis_timestamp: new Date().toISOString(),
    distributions,
    profile,
    totals: {
      functions: totalFunctions,
    },
    functionMetricsSummary,
    complexity: complexitySummary,
    smells: totalSmells,
    maintainability,
    testCoverageProxy,
    duplication,
    git,
    gitMetricsV2,
    ...(contributors && contributors.length > 0 ? { contributors } : {}),
    framework,
    perFile,
    reactMetrics,
    phase3,
    symbolVerificationRisks,
  };
}
