# Output Schema Reference

This document describes the complete JSON report produced by `ts-repo-metrics` (CLI and dashboard API). The web dashboard groups these fields into tabs (Behavioral, Verification, Quality, React & TSX, Lexical, AI smells, Dataset); see the [README](../README.md#dashboard) for the mapping.

## Top-level structure (`RepoReport`)

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `repoPath` | `string` | no | Absolute path to the analyzed repository |
| `source` | `SourceInfo` | no | Origin metadata (local path vs cloned GitHub URL) |
| `filesAnalyzed` | `number` | no | Total `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, and `.ipynb` files successfully parsed. web2py and Django repos contribute zero |
| `analysisSkipped` | `object` | **yes** | `{ id: "web2py" \| "django", message }` when the whole repository was skipped, including JS and TS. Absent when the repo was scored. The feature vector copies the id to `analysis_skipped` (`""` when scored) so a zero-file row is not treated as an empty repository |
| `filesSkipped` | `number` | **yes** | Files skipped due to read or parse errors |
| `analyzer_version` | `string` | **yes** | Analyzer package version (from `packages/engine/package.json` when run via the engine — CLI or dashboard) |
| `analysis_timestamp` | `string` | **yes** | ISO 8601 timestamp when analysis ran |
| `distributions` | `DistributionMetrics` | **yes** | Tail risk indicators (p50/p75/p90, concentration) |
| `profile` | `RepoProfile` | no | File counts and LOC breakdown |
| `totals` | `object` | no | Aggregate metrics |
| `totals.functions` | `number` | no | Total function-like nodes |
| `functionMetricsSummary` | `FunctionMetricsSummary` | no | Repo-wide function structural metrics |
| `complexity` | `ComplexitySummary` | no | Repo-wide cyclomatic complexity |
| `smells` | `SmellCounts` | no | Aggregated code smell counts |
| `maintainability` | `MaintainabilityResult` | **yes** | Maintainability Index score. Null when `analysisSkipped` is set. The feature vector still writes `maintainability_score` 0 and an empty classification for that null, so filter on `analysis_skipped` before using maintainability |
| `testCoverageProxy` | `TestCoverageProxy` | no | Test LOC / source LOC ratio |
| `duplication` | `DuplicationMetrics` | **yes** | jscpd duplication analysis (null if jscpd fails) |
| `git` | `GitMetrics` | **yes** | Commit history metrics (null for non-git repos) |
| `gitMetricsV2` | `GitMetricsV2` | **yes** | Extended git metrics (Epic D; null for non-git repos) |
| `framework` | `FrameworkInfo` | **yes** | Detected framework (null when there is no package.json and no Python) |
| `perFile` | `PerFileEntry[]` | no | Per-file metrics |
| `byLanguage` | `Partial<Record<LanguageBucket, LanguageSummary>>` | **yes** | Per-language aggregates; only buckets with scored files appear |
| `python` | `PythonMetrics` | **yes** | Python type hints and top-level code; present when `.py` or `.ipynb` files were scored |
| `backendMetrics` | `BackendMetrics` | **yes** | Flask / FastAPI route handlers; present when at least one was found |
| `reactMetrics` | `ReactMetricsReport` | **yes** | RQ3 React/TSX static metrics (present when at least one `.tsx` file was analyzed) |
| `phase3` | `Phase3Metrics` | **yes** | Phase 3 — silent failures (React-scope JS/TS and all Python), monolithic component rate, weighted jscpd redundancy |

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
| `commit` | `string` | HEAD commit SHA (PR head when `scope` is `"pr"`) |
| `branch` | `string` | Current branch name (PR head ref when `scope` is `"pr"`) |
| `scope` | `string` | `"repo"` or `"pr"` — `"pr"` means changed source files at the pull-request head. Omitted on older reports (treat as `"repo"`). |
| `prNumber` | `number` | Pull request number when `scope` is `"pr"` |
| `baseSha` | `string` | PR base SHA |
| `headSha` | `string` | PR head SHA |
| `changedFiles` | `string[]` | Repo-relative source paths included in a PR-scoped run (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`) |

## `profile` — Repository Profiling

| Field | Type | Description |
|-------|------|-------------|
| `totalFiles` | `number` | Analyzed source files (excluding ignored dirs) |
| `tsFiles` | `number` | Count of `.ts` files |
| `tsxFiles` | `number` | Count of `.tsx` files |
| `jsFiles` | `number` | Count of `.js`, `.mjs`, and `.cjs` files |
| `jsxFiles` | `number` | Count of `.jsx` files |
| `pyFiles` | `number` | Count of `.py` files. Zero on a web2py or Django skip, along with every other profile count and LOC field |
| `notebookFiles` | `number` | Count of `.ipynb` files. Their LOC counts code-cell lines only; a malformed notebook adds 0 lines and is counted in `filesSkipped` |
| `testFiles` | `number` | `*.test` / `*.spec` for JS and TS, plus `test_*.py`, `*_test.py`, and `conftest.py` |
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

Returns `null` for non-git repos or shallow clones. Git CLI is required for Analyze (the Vercel zipball + REST `api` mode is retired). Older stored reports may still have `mode: "api"`.

### Data source: `mode`

| Value | Source |
|-------|--------|
| `"local"` | Git CLI (simple-git) |
| `"api"` | Legacy GitHub REST fallback (retired zipball path; not produced by current Analyze) |
| `"none"` | Neither available (with `unavailable: true`) |

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalCommits` | `number` | Total commits in history |
| `medianCommitSize` | `number` | Median lines changed per commit (0 in API mode) |
| `avgLinesPerCommit` | `number` | Mean lines changed per commit (0 in API mode) |
| `largeCommitRatio` | `number` | % of commits > 500 lines changed (0 in API mode) |
| `commitsPerWeek` | `number` | Commits per week (last 13 weeks) |
| `mode` | `string` | `"local"` (git CLI), `"api"` (GitHub API), or `"none"` |
| `unavailable` | `boolean` | True when both git CLI and API fallback failed |
| `activeDaysLast90Days` | `number` | Unique commit dates in last 90 days (API mode) |
| `medianInterCommitHours` | `number` | Median gap between commits in hours (API mode) |
| `burstRatio` | `number` | % commits within 1 hour of previous (API mode) |
| `medianCommitMessageLength` | `number` | Median commit message length (API mode) |

In API mode, `medianCommitSize`, `avgLinesPerCommit`, and `largeCommitRatio` are 0 because the list-commits API does not return diff stats.

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

Returns `null` when there is no `package.json` and no Python. A repo without `package.json` that has Python gets a Python-only record whose `type` is the Python backend, or `Python`.

Python detection reads `requirements.txt`, `requirements-dev.txt`, `pyproject.toml`, `Pipfile`, `setup.py`, and `setup.cfg` at the repo root and one folder down (`backend/`, `api/`, …), plus top-level imports from the scored Python files.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Primary framework: `Next.js`, `React`, `NestJS`, `Fastify`, `Express`, or `Node` from `package.json`; else `FastAPI`, `Flask`, `Starlette`, or `Python` |
| `hasReact` | `boolean` | Whether `react` is a dependency |
| `hasBackend` | `boolean` | Whether a JS or Python backend framework is detected |
| `pythonBackend` | `"FastAPI" \| "Flask" \| "Starlette" \| null` | Optional. Python web framework; FastAPI wins over Starlette |
| `pythonStack` | `string[]` | Optional. AI/ML tags: `torch`, `tensorflow`, `scikit-learn`, `xgboost`, `transformers`, `langchain`, `llama-index`, `openai`, `anthropic` |

## `perFile` — Per-File Entry

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path relative to `repoPath` |
| `functions` | `number` | Total function-like nodes |
| `functionsByType` | `Record<string, number>` | Breakdown by AST node type |
| `functionMetrics` | `FunctionDetail[]` | Per-function structural metrics |
| `complexity` | `FunctionComplexity[]` | Per-function complexity |
| `moduleScope` | `ModuleScopeMetrics` | Optional. Python and notebooks: top-level statements outside any function or class, scored as one unit and kept out of function totals |

### `ModuleScopeMetrics`

| Field | Type | Description |
|-------|------|-------------|
| `cyclomaticComplexity` | `number` | 1 + branch points in top-level statements (Python rules) |
| `maxNestingDepth` | `number` | Deepest nesting outside defs and classes |
| `lines` | `number` | Lines spanned by top-level statements, excluding defs, classes, imports, and docstrings |

### `FunctionDetail`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Function name or `"(anonymous)"` |
| `type` | `string` | AST node type |
| `startLine` | `number` | 1-based line number |
| `lines` | `number` | Total line count |
| `maxNestingDepth` | `number` | Deepest nesting of control flow |
| `parameterCount` | `number` | Number of declared parameters |
| `cyclomaticComplexity` | `number` | Cyclomatic complexity (same as `1 +` branch points + `&&`/`||`); aligns with `FunctionComplexity.complexity` |
| `halstead` | `HalsteadMetrics \| null` | Halstead operator/operand metrics (lexical volume). Null on `.py` functions |
| `cognitiveComplexity` | `number \| null` | Additive cognitive score (nesting-aware; Sonar-style). Null on `.py` functions |
| `maintainabilityIndexGradAiRaw` | `number \| null` | GRAD-AI raw MI: `171 - 5.2·ln(V) - 0.23·CC - 16.2·ln(LOC)` (natural logs); `V` = Halstead `volume`, `CC` = cyclomatic, `LOC` = `lines`. Null on `.py` functions |
| `maintainabilityIndexGradAiNorm` | `number \| null` | `max(0, MI_raw · 100 / 171)`. Null on `.py` functions |
| `isReactComponent` | `boolean` | Heuristic: `.tsx` file and (PascalCase name or JSX in body) |
| `isMonolithic` | `boolean` | `true` when `isReactComponent` and `lines` exceed the monolithic threshold (50 SLOC; see `constants.ts`) |
| `notebookCell` | `number` | Optional. Notebooks: 1-based code cell holding `startLine`. `startLine` counts lines in the joined code cells |
| `typedParameterCount` | `number` | Optional. Python `def`: parameters with an annotation, counted like `parameterCount` |
| `hasReturnAnnotation` | `boolean` | Optional. Python `def`: has a `-> T` annotation |

### `HalsteadMetrics`

| Field | Type | Description |
|-------|------|-------------|
| `n1`, `n2` | `number` | Distinct operators / operands |
| `N1`, `N2` | `number` | Total operator / operand occurrences |
| `volume` | `number` | `(N1+N2) * log2(n1+n2)` when `n1+n2 > 0` |
| `difficulty` | `number` | `(n1/2) * (N2/n2)` when `n2 > 0` |
| `effort` | `number` | `difficulty * volume` |

Repo-level `maintainability` (Coleman-style index from average complexity and LOC) is **separate** from per-function `maintainabilityIndexGradAi*`.

### `FunctionComplexity`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Function name or `"(anonymous)"` |
| `type` | `string` | AST node type |
| `startLine` | `number` | 1-based line number |
| `complexity` | `number` | Cyclomatic complexity (>= 1) |

## `reactMetrics` — React / TSX (optional)

Present when at least one `.tsx` file was successfully parsed. Heuristic **components** are function-like nodes whose body contains JSX.

### `ReactMetricsReport`

| Field | Type | Description |
|-------|------|-------------|
| `components` | `ReactComponentMetrics[]` | Per-component metrics |
| `summary` | `ReactMetricsSummary` | Repo-level aggregates |

### `ReactMetricsSummary`

| Field | Type | Description |
|-------|------|-------------|
| `tsxFilesAnalyzed` | `number` | Count of `.tsx` files included |
| `componentsAnalyzed` | `number` | Heuristic component count |
| `ferreiraLackOfCohesionCount` | `number` | Components exceeding Ferreira-style hook + SLOC thresholds |
| `tampereJsxDepthExceededCount` | `number` | Components whose max nested JSX depth exceeds the configured threshold |
| `totalPropDrillingEdges` | `number` | Same-file prop pass-through edges (MVP) |
| `totalConditionalHookCalls` | `number` | Sum of conditional `use*` calls (heuristic) |
| `totalAsyncUseEffect` | `number` | Sum of async `useEffect` patterns |
| `totalMissingOrInvalidDepsArray` | `number` | Sum of missing or non-literal dependency arrays |
| `totalNonPrimitiveDepRisk` | `number` | Sum of non-primitive dependency entries (heuristic) |
| `maxJsxDepthRepo` | `number` | Maximum JSX nesting depth observed |

### `ReactComponentMetrics`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Component name |
| `file` | `string` | Path relative to repo root |
| `startLine` | `number` | 1-based start line |
| `lines` | `number` | Lines of code (SLOC) |
| `hookCount` | `number` | React hook call count |
| `hooksPerSloc` | `number` | Hooks per line |
| `ferreiraLackOfCohesion` | `boolean` | True when hook + SLOC thresholds both exceeded |
| `maxJsxDepth` | `number` | Max nested JSX depth in this component |
| `tampereJsxDepthExceeded` | `boolean` | True when depth exceeds threshold |
| `propDrillingEdges` | `number` | Same-file pass-through edges |
| `hookSafety` | `ReactHookSafetyFlags` | Hook idiom heuristics |

### `ReactHookSafetyFlags`

| Field | Type | Description |
|-------|------|-------------|
| `conditionalHookCalls` | `number` | `use*` under conditional / loop (heuristic) |
| `asyncUseEffect` | `number` | `useEffect` with async callback pattern |
| `missingOrInvalidDepsArray` | `number` | Missing or non-array-literal deps |
| `nonPrimitiveDepRisk` | `number` | Object/array/call deps (heuristic) |

## `phase3` — AI smell / pathology (optional)

Present when the analyzer build includes Phase 3. **Silent failure** events come from JS/TS files in React scope (empty `catch`, or a `catch` that only logs to console) and from every Python file and notebook (an `except` whose body is only `pass`, `...`, or `continue`, or only `print`, `logging.*`, `logger.*`, or `traceback.print_exc()`). An `except` that also raises or does other work is not an event. Including Python changes `sfd` on any repo with Python. **SRS** uses jscpd duplicate pairs with per-pair similarity (file excerpt + Levenshtein ratio when fragments are unavailable); see [METRICS_CONCEPTS.md](METRICS_CONCEPTS.md).

### `SilentFailureEvent`

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path relative to repo root |
| `line` | `number` | 1-based line (`catch` or `except` keyword) |
| `kind` | `string` | `empty_catch` or `console_only_catch` |

### `Phase3Metrics`

| Field | Type | Description |
|-------|------|-------------|
| `sfd` | `number` | Silent failure density: `silentFailureEvents.length / (profile.sourceLOC / 1000)`; `0` if `sourceLOC === 0` |
| `mcr` | `number \| null` | Monolithic component rate: `monolithicComponentCount / reactComponentCount`; **`null`** if `reactComponentCount === 0` |
| `srs` | `number` | Structural redundancy score: `srsWeightedNumerator / (profile.sourceLOC / 1000)`; `0` if `sourceLOC === 0` |
| `silentFailureEvents` | `SilentFailureEvent[]` | All silent-failure events |
| `srsWeightedNumerator` | `number` | Sum of weighted duplicate line mass (1.0 @ 100% similarity, 0.5 for similarity in (80%, 100%), 0 otherwise) |
| `srsExactWeightedLines` | `number` | Portion of numerator from 100% matches |
| `srsNearWeightedLines` | `number` | Portion of numerator from (80%, 100%) near-clone matches |
| `monolithicComponentCount` | `number` | React components with `lines` > threshold |
| `reactComponentCount` | `number` | Functions with `isReactComponent === true` |

## `byLanguage` — Per-Language Aggregates (optional)

Keys: `ecmascript` (`.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs`), `python` (`.py`), `notebook` (`.ipynb`). Cyclomatic rules differ by language (JS counts `else`, Python does not, and comprehension filters add nothing), so compare complexity within one bucket.

| Field | Type | Description |
|-------|------|-------------|
| `files` | `number` | Files scored in this bucket |
| `sourceLOC` / `testLOC` | `number` | LOC split by `isTestFilePath` |
| `functions` | `number` | Function-like nodes |
| `averageComplexity` / `maxComplexity` | `number` | Cyclomatic, this bucket only |
| `highComplexityFunctions` | `number` | Functions above the high-complexity threshold |
| `averageFunctionLength` | `number` | Mean function lines |
| `smells` | `SmellCounts` | Smell totals for this bucket |

## `python` — Python Extras (optional)

### `typeHints`

Over Python `def` functions; lambdas cannot be annotated and are excluded. A leading `self` / `cls` on a method is not counted.

| Field | Type | Description |
|-------|------|-------------|
| `functions` | `number` | `def` functions |
| `functionsWithReturnAnnotation` | `number` | With `-> T` |
| `parameters` / `typedParameters` | `number` | Counted parameters, and those with an annotation |
| `parameterCoverage` | `number \| null` | `typedParameters / parameters`; null with no parameters |
| `returnCoverage` | `number \| null` | `functionsWithReturnAnnotation / functions`; null with no functions |

### `moduleScope`

| Field | Type | Description |
|-------|------|-------------|
| `filesWithTopLevelCode` | `number` | Files with a `perFile[].moduleScope` |
| `topLevelLines` | `number` | Sum of their `lines` |
| `maxComplexity` / `averageComplexity` | `number` | Over those files' top-level code |

## `backendMetrics` — Flask / FastAPI Routes (optional)

A route handler is a decorated `def` whose decorator is `@<obj>.get/post/put/delete/patch/options/head/route/api_route/websocket(...)` with a first argument that is a string path starting with `/` (or empty). Handlers in test files are skipped, as are `mock.patch` decorators.

| Field | Type | Description |
|-------|------|-------------|
| `endpoints` | `EndpointDetail[]` | `file`, `handler`, `methods` (`GET`…, or `ROUTE` for Flask `@app.route` without `methods`), `path`, `startLine`, `lines`, `cyclomaticComplexity`, `isAsync`, `blockingCalls` |
| `summary.endpointCount` / `asyncEndpoints` | `number` | Handler counts |
| `summary.fatHandlers` / `fatHandlerShare` | `number` | Handlers over 50 lines, and their share |
| `summary.averageHandlerComplexity` / `maxHandlerComplexity` | `number` | Cyclomatic over handlers |
| `summary.blockingCallsInAsync` / `asyncHandlersWithBlockingCalls` | `number` | `requests.*`, `httpx.<verb>`, `time.sleep`, and `subprocess.*` calls made directly in `async def` handlers |
