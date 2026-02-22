# Output Schema Reference

This document describes the complete JSON report produced by `ts-repo-metrics`.

## Top-level structure (`RepoReport`)

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `repoPath` | `string` | no | Absolute path to the analyzed repository |
| `source` | `SourceInfo` | no | Origin metadata (local path vs cloned GitHub URL) |
| `filesAnalyzed` | `number` | no | Total `.ts`/`.tsx` files successfully parsed |
| `filesSkipped` | `number` | **yes** | Files skipped due to read or parse errors |
| `analyzer_version` | `string` | **yes** | Analyzer package version (from package.json) |
| `analysis_timestamp` | `string` | **yes** | ISO 8601 timestamp when analysis ran |
| `distributions` | `DistributionMetrics` | **yes** | Tail risk indicators (p50/p75/p90, concentration) |
| `profile` | `RepoProfile` | no | File counts and LOC breakdown |
| `totals` | `object` | no | Aggregate metrics |
| `totals.functions` | `number` | no | Total function-like nodes |
| `functionMetricsSummary` | `FunctionMetricsSummary` | no | Repo-wide function structural metrics |
| `complexity` | `ComplexitySummary` | no | Repo-wide cyclomatic complexity |
| `smells` | `SmellCounts` | no | Aggregated code smell counts |
| `maintainability` | `MaintainabilityResult` | no | Maintainability Index score |
| `testCoverageProxy` | `TestCoverageProxy` | no | Test LOC / source LOC ratio |
| `duplication` | `DuplicationMetrics` | **yes** | jscpd duplication analysis (null if jscpd fails) |
| `git` | `GitMetrics` | **yes** | Commit history metrics (null for non-git repos) |
| `gitMetricsV2` | `GitMetricsV2` | **yes** | Extended git metrics (Epic D; null for non-git repos) |
| `framework` | `FrameworkInfo` | **yes** | Detected framework (null if no package.json) |
| `perFile` | `PerFileEntry[]` | no | Per-file metrics |

## `distributions` — Distribution Metrics (optional)

Tail risk indicators for research. Percentiles computed across all functions.

| Field | Type | Description |
|-------|------|-------------|
| `p50_function_length` | `number` | 50th percentile function length (LOC) |
| `p75_function_length` | `number` | 75th percentile function length (LOC) |
| `p90_function_length` | `number` | 90th percentile function length (LOC) |
| `p50_complexity` | `number` | 50th percentile cyclomatic complexity |
| `p75_complexity` | `number` | 75th percentile cyclomatic complexity |
| `p90_complexity` | `number` | 90th percentile cyclomatic complexity |
| `percent_high_complexity_in_top_10_percent_files` | `number` | % of high-complexity functions in the top 10% of files by total complexity |

## `source` — Source Metadata

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | `"local"` (user-provided path) or `"git"` (cloned from URL) |
| `url` | `string` | Clone URL for `type: "git"`, empty for `type: "local"` |
| `commit` | `string` | HEAD commit SHA |
| `branch` | `string` | Current branch name |

## `profile` — Repository Profiling

| Field | Type | Description |
|-------|------|-------------|
| `totalFiles` | `number` | Total `.ts` + `.tsx` files (excluding ignored dirs) |
| `tsFiles` | `number` | Count of `.ts` files |
| `tsxFiles` | `number` | Count of `.tsx` files |
| `testFiles` | `number` | Files matching `*.test.ts`, `*.spec.ts`, etc. |
| `totalLOC` | `number` | Total lines of code across all files |
| `sourceLOC` | `number` | Lines of code in non-test files |
| `testLOC` | `number` | Lines of code in test files |

## `functionMetricsSummary` — Function Metrics

| Field | Type | Description |
|-------|------|-------------|
| `totalFunctions` | `number` | Total function-like nodes |
| `averageLength` | `number` | Mean line count |
| `medianLength` | `number` | Median line count |
| `maxNestingDepth` | `number` | Deepest nesting found |
| `longFunctionPercentage` | `number` | % of functions > 50 lines |

## `complexity` — Cyclomatic Complexity

| Field | Type | Description |
|-------|------|-------------|
| `average` | `number` | Mean complexity across all functions |
| `max` | `number` | Highest single-function complexity |
| `highComplexityFunctions` | `number` | Functions with complexity > 10 |

## `smells` — Code Smells

| Field | Type | Description |
|-------|------|-------------|
| `longFunctions` | `number` | Functions > 50 lines |
| `deepNesting` | `number` | Functions nested > 4 levels |
| `longParameterLists` | `number` | Functions with > 4 parameters |
| `emptyCatchBlocks` | `number` | `catch` clauses with empty body |
| `consoleLogs` | `number` | `console.log/warn/error` calls |

## `maintainability` — Maintainability Index

Formula: `MI = max(0, 171 - 5.2·ln(avgComplexity) - 0.23·ln(totalLOC) - 16.2·ln(avgFnLength)) × 100/171`

| Field | Type | Description |
|-------|------|-------------|
| `score` | `number` | Normalized MI score (0–100) |
| `classification` | `string` | `"low"` (< 40), `"moderate"` (40–65), `"high"` (> 65) |

## `testCoverageProxy` — Test Coverage Proxy

| Field | Type | Description |
|-------|------|-------------|
| `ratio` | `number` | testLOC / sourceLOC (0.0 to 1.0+) |
| `classification` | `string` | `"low"` (< 0.1), `"moderate"` (0.1–0.3), `"high"` (> 0.3) |

## `duplication` — Code Duplication (nullable)

Returns `null` if jscpd fails or is unavailable.

| Field | Type | Description |
|-------|------|-------------|
| `percentage` | `number` | Duplicate code percentage |
| `duplicateLines` | `number` | Total duplicated lines |
| `cloneClusters` | `number` | Number of clone clusters found |

## `git` — Git History (nullable)

Returns `null` for non-git repos or shallow clones.

| Field | Type | Description |
|-------|------|-------------|
| `totalCommits` | `number` | Total commits in history |
| `medianCommitSize` | `number` | Median lines changed per commit |
| `avgLinesPerCommit` | `number` | Mean lines changed per commit |
| `largeCommitRatio` | `number` | % of commits > 500 lines changed |
| `commitsPerWeek` | `number` | Commits per week (last 13 weeks) |

## `gitMetricsV2` — Extended Git Metrics (nullable)

Returns `null` for non-git repos or when no commit history is available. Epic D metrics.

| Field | Type | Description |
|-------|------|-------------|
| `commitStats` | `CommitStats` | D1: Size distribution |
| `commitStats.medianCommitSize` | `number` | Median lines changed per commit |
| `commitStats.p90CommitSize` | `number` | 90th percentile commit size |
| `commitStats.pctOver500Loc` | `number` | % of commits > 500 lines changed |
| `commitStats.pctOver1000Loc` | `number` | % of commits > 1000 lines changed |
| `burstStats` | `BurstStats` | D2: Burst detection |
| `burstStats.burstCount` | `number` | Count of bursts (≥3 commits in 30 min) |
| `burstStats.burstRatio` | `number` | % of commits that fall in a burst |
| `entropy` | `EntropyStats` | D3: Temporal irregularity |
| `entropy.stdDevTimeBetweenCommits` | `number` | Std dev of time between consecutive commits (ms) |
| `churn` | `ChurnStats` | D4: Top files by churn |
| `churn.topByModifications` | `ChurnHotspot[]` | Top 10 files by modification count |
| `churn.topByLinesChanged` | `ChurnHotspot[]` | Top 10 files by lines changed |
| `refactorBehavior` | `RefactorBehaviorStats` | D6: Refactor commit rate |
| `refactorBehavior.refactorCommitRatio` | `number` | % of commits with refactor/cleanup/restructure/rename |
| `testCoupling` | `TestCouplingStats` | D5: Test coupling |
| `testCoupling.pctCommitsTouchingTests` | `number` | % of commits touching test files |
| `testCoupling.testToFeatureCommitRatio` | `number` | Ratio of test commits to feature commits |

## `framework` — Framework Detection (nullable)

Returns `null` if no `package.json` is found.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Primary framework: `Next.js`, `React`, `NestJS`, `Fastify`, `Express`, or `Node` |
| `hasReact` | `boolean` | Whether `react` is a dependency |
| `hasBackend` | `boolean` | Whether a backend framework is detected |

## `perFile` — Per-File Entry

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path relative to `repoPath` |
| `functions` | `number` | Total function-like nodes |
| `functionsByType` | `Record<string, number>` | Breakdown by AST node type |
| `functionMetrics` | `FunctionDetail[]` | Per-function structural metrics |
| `complexity` | `FunctionComplexity[]` | Per-function complexity |

### `FunctionDetail`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Function name or `"(anonymous)"` |
| `type` | `string` | AST node type |
| `startLine` | `number` | 1-based line number |
| `lines` | `number` | Total line count |
| `maxNestingDepth` | `number` | Deepest nesting of control flow |
| `parameterCount` | `number` | Number of declared parameters |

### `FunctionComplexity`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Function name or `"(anonymous)"` |
| `type` | `string` | AST node type |
| `startLine` | `number` | 1-based line number |
| `complexity` | `number` | Cyclomatic complexity (>= 1) |
