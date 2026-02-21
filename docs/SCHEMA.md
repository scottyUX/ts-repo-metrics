# Output Schema Reference

This document describes the complete JSON report produced by `ts-repo-metrics`.

## Top-level structure (`RepoReport`)

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `repoPath` | `string` | no | Absolute path to the analyzed repository |
| `filesAnalyzed` | `number` | no | Total `.ts`/`.tsx` files parsed |
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
| `framework` | `FrameworkInfo` | **yes** | Detected framework (null if no package.json) |
| `perFile` | `PerFileEntry[]` | no | Per-file metrics |

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
