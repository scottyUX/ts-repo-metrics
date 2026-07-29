# Output Schema Reference

This document describes the complete JSON report produced by `ts-repo-metrics` (CLI and dashboard API). The web dashboard groups these fields into tabs (Behavioral, Verification, Quality, React & TSX, Lexical, AI smells, Dataset); see the [README](../README.md#dashboard) for the mapping.

## Top-level structure (`RepoReport`)

The authoritative definition is `RepoReport` in
[`packages/engine/src/types/report.ts`](../packages/engine/src/types/report.ts).

**Read the Presence column carefully.** Two different things are often called
"nullable", and consumers have to handle them differently:

| Presence | Meaning | How to test |
|----------|---------|-------------|
| `always` | Key is always in the JSON with a non-null value | direct access |
| `nullable` | Key is **always in the JSON** but its value may be `null` | `report.x === null` |
| `optional` | Key is **omitted from the JSON entirely** under the stated condition | `"x" in report` |

`optional` is the one that bites: `JSON.stringify` drops `undefined`, so an
absent key is indistinguishable from a key that was never computed. Every
`optional` row below states the condition under which it disappears.

| Field | Type | Presence | Produced by | Description |
|-------|------|----------|-------------|-------------|
| `repoPath` | `string` | always | `pipeline/analyzeRepo` | Absolute path to the analyzed repository |
| `source` | `SourceInfo` | always | `collect/repoMetadata` | Origin metadata (local path vs cloned GitHub URL) |
| `filesAnalyzed` | `number` | always | `collect/fileDiscovery` | Count of `.ts`/`.tsx`/`.js`/`.jsx`/`.py` files successfully parsed. Equals `perFile.length` |
| `filesSkipped` | `number` | **optional** | `pipeline/analyzeRepo` | Files discovered but never parsed. **Omitted entirely when zero** — do not expect `0`. See [Skipped files](#filesskipped--skipped-files-optional) |
| `analysisSkipped` | `UnsupportedFrameworkInfo` | **optional** | `collect/pythonFrameworkDetection` | Present **instead of** real metrics when the target is web2py or Django. Absent for every supported target. See [analysisSkipped](#analysisskipped--unsupported-python-framework) |
| `analyzer_version` | `string` | optional | `pipeline/analyzeRepo` | Engine package version. Omitted if `packages/engine/package.json` could not be read |
| `analysis_timestamp` | `string` | always | `pipeline/analyzeRepo` | ISO 8601 timestamp when analysis ran |
| `distributions` | `DistributionMetrics` | always | `extract/distributions` | Tail risk indicators (p50/p75/p90, concentration). Optional in the type; emitted unconditionally by current builds |
| `profile` | `RepoProfile` | always | `collect/loc` | File counts and LOC breakdown |
| `totals` | `object` | always | `extract/functionCount` | Aggregate metrics |
| `totals.functions` | `number` | always | `extract/functionCount` | Total function-like nodes. See [what counts as a function](../README.md#what-counts-as-a-function) |
| `functionMetricsSummary` | `FunctionMetricsSummary` | always | `extract/functionMetrics` | Repo-wide function structural metrics |
| `complexity` | `ComplexitySummary` | always | `extract/complexity` | Repo-wide cyclomatic complexity |
| `smells` | `SmellCounts` | always | `extract/smells` | Aggregated code smell counts |
| `maintainability` | `MaintainabilityResult` | always | `extract/maintainabilityIndex` | Coleman-style repo Maintainability Index |
| `testCoverageProxy` | `TestCoverageProxy` | always | `extract/testCoverageProxy` | Test LOC / source LOC ratio |
| `duplication` | `DuplicationMetrics` | **nullable** | `collect/duplication` (jscpd) | `null` when jscpd fails or is unavailable |
| `git` | `GitMetrics` | **nullable** | `collect/gitMetrics` or `collect/gitMetricsApi` | `null` for non-git repos. See [git](#git--git-history-nullable) |
| `gitMetricsV2` | `GitMetricsV2` | **nullable** | `collect/gitMetricsV2` | `null` when no local commit history was readable |
| `commitCalendar` | `CommitCalendar` | **optional** | `collect/gitMetricsApi` | Top-level copy populated **only** on the GitHub-API path. See [commitCalendar](#commitcalendar--commit-heatmap-optional) |
| `contributors` | `ContributorActivity[]` | **optional** | `collect/gitMetricsV2` or `collect/gitMetricsApi` | Omitted when no history was analyzed or the list is empty. See [contributors](#contributors--per-author-activity-optional) |
| `github` | `GitHubRepositoryMeta` | **optional** | `collect/githubRepoMeta` | GitHub REST metadata. Absent for local-path analysis **and silently absent if the API call fails**. See [github](#github--github-repository-metadata-optional) |
| `framework` | `FrameworkInfo` | **nullable** | `collect/frameworkDetection` | `null` if no `package.json` is found |
| `perFile` | `PerFileEntry[]` | always | `pipeline/analyzeRepo` | Per-file metrics, one entry per successfully parsed file |
| `reactMetrics` | `ReactMetricsReport` | **optional** | `extract/react` | Omitted unless at least one `.tsx`/`.jsx` file was parsed |
| `phase3` | `Phase3Metrics` | always | `extract/silentFailures`, `collect/weightedRedundancy` | Optional in the type; emitted unconditionally by current builds |
| `symbolVerificationRisks` | `SymbolVerificationRisk[]` | always | `extract/symbolVerificationRisk` | May be `[]`. Absent in reports cached before this field existed. See [symbolVerificationRisks](#symbolverificationrisks--complexity-vs-test-proximity) |

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

## `filesSkipped` — Skipped files (optional)

Produced by `pipeline/analyzeRepo`. **Omitted from the JSON when zero**, so
`report.filesSkipped === undefined` is the healthy case and there is no `0` to
read.

A skipped file was discovered by `collect/fileDiscovery` but never parsed, so
**every function in it is missing from every metric in this report** —
`totals.functions`, `complexity`, `smells`, `distributions`, `phase3` and the
per-function tables all describe less code than the repository contains. The
count is not a diagnostic detail; it is a caveat on every other number.

Each skipped file logs a named reason to **stderr**. The reason is not carried
in the JSON, so a report consumed without its log cannot tell you *why*:

| stderr reason | Condition |
|---------------|-----------|
| `could not read file` | `readFile` failed — permissions, broken symlink, or the file disappeared mid-run |
| `file_too_large_for_parser (<n> chars)` | Tree-sitter rejected the source as too large for its read buffer. Should be unreachable: `parsing/sourceParser` sizes the buffer to the source. Treat any occurrence as a bug to report |
| `parse_error: <message>` | Tree-sitter rejected the source for some other reason |

Historically any file of 32,768 characters or more failed with a bare
`Invalid argument` and was folded into this count with no named reason, which
silently removed 9.3% of this repository's own functions from every metric.
See [research/validation/findings.md](../research/validation/findings.md) (D9).

When comparing two reports, check this field first: a non-zero value on one
side and an absent field on the other means the two describe different amounts
of code, regardless of what the metrics say.

## `source` — Source Metadata

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | `"local"` (user-provided path) or `"git"` (cloned from URL) |
| `url` | `string` | Clone URL for `type: "git"`, empty for `type: "local"` |
| `commit` | `string` | HEAD commit SHA |
| `branch` | `string` | Current branch name |

## `analysisSkipped` — Unsupported Python framework

Present when the repository layout indicates **web2py** or **Django**. Static AST analysis is skipped; git metrics may still be populated.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `"web2py"` \| `"django"` | Detected unsupported framework |
| `message` | `string` | User-facing explanation |

Detection rules: **web2py** when `web2py/gluon`, `web2py/applications`, or root `web2py.py` exists; **Django** when root `manage.py` exists and `django` appears in `requirements.txt`, `requirements/*.txt`, or `pyproject.toml`.

## `profile` — Repository Profiling

| Field | Type | Description |
|-------|------|-------------|
| `totalFiles` | `number` | Total analyzable source files (excluding ignored dirs) |
| `tsFiles` | `number` | Count of `.ts` files |
| `tsxFiles` | `number` | Count of `.tsx` files |
| `jsFiles` | `number` | Count of `.js` files |
| `jsxFiles` | `number` | Count of `.jsx` files |
| `pyFiles` | `number` | Count of `.py` files |
| `testFiles` | `number` | Files matching `*.test.ts`, `*.spec.js`, `test_*.py`, etc. |
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

Returns `null` for non-git repos or shallow clones. When the git CLI is unavailable (e.g. Vercel zipball mode), metrics may come from the GitHub REST API fallback instead of local git.

### Data source: `mode`

| Value | Source |
|-------|--------|
| `"local"` | Git CLI (simple-git) |
| `"api"` | GitHub REST API (serverless fallback) |
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

## `commitCalendar` — Commit heatmap (optional)

Produced by `collect/gitMetricsApi`. Mon–Sun × week contribution grid.

**The same data can appear in two places, and which one is populated depends on
how history was read:**

| Situation | Where the calendar is |
|-----------|-----------------------|
| Local `.git` available | `gitMetricsV2.commitCalendar` — top-level key **absent** |
| GitHub API only (zipball mode, no local `.git`) | top-level `commitCalendar` — `gitMetricsV2` is usually `null` |
| No history at all | Neither is populated |

Consumers should therefore always read
`gitMetricsV2?.commitCalendar ?? commitCalendar`. Reading the top-level key
alone yields an empty heatmap for every locally analyzed repository, which
looks like "this repo has no commits" rather than "you read the wrong key".

### `CommitCalendar`

| Field | Type | Description |
|-------|------|-------------|
| `grid` | `number[][]` | 7 rows (Mon..Sun) × `columnWeekStarts.length` columns, oldest week first. Each cell is a commit count |
| `columnWeekStarts` | `string[]` | ISO date (UTC) of the Monday beginning each column |
| `busiestWeekdayIndex` | `number \| null` | `0` = Monday .. `6` = Sunday; the weekday with the most commits in the window. `null` when there were no commits to rank |

## `contributors` — Per-author activity (optional)

Produced by `collect/gitMetricsV2` on the local-git path, or overwritten by
`collect/gitMetricsApi` in zipball mode. **Omitted when no history was analyzed
or when the computed list is empty** — the key is only written when
`contributors.length > 0`, so an absent key means "no attributable commits",
not "no contributors field in this schema version".

Each entry carries the same class of signals as `gitMetricsV2`, computed over
only the commits attributed to one author identity. Authors are grouped by
lowercased email when present, else by name, else bucketed as `"unknown"`, so
one human committing under two emails appears as two entries.

### `ContributorActivity`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Grouping key: lowercased author email, else name-based, else `"unknown"` |
| `displayName` | `string` | Author name as recorded in the commits |
| `authorEmail` | `string` | Author email as recorded in the commits |
| `commitCount` | `number` | Commits attributed to this identity |
| `linesAdded` | `number` | Σ added lines from `git log --numstat` |
| `linesDeleted` | `number` | Σ deleted lines from `git log --numstat` |
| `testLineChurn` | `number` | Σ(add+del) on paths matching the test convention. **Historical churn, not snapshot LOC** — not comparable to `profile.testLOC` |
| `sourceLineChurn` | `number` | Σ(add+del) on non-test paths |
| `testFilesTouched` | `number` | Distinct test paths touched |
| `sourceFilesTouched` | `number` | Distinct non-test paths touched |
| `sourcePathsTouchedList` | `string[]` (optional) | Distinct non-test paths touched, forward slashes, sorted. Lets the dashboard narrow symbol views to files seen in `git log --numstat` |
| `commitStats` | `CommitStats` | Per-author size distribution (same shape as `gitMetricsV2.commitStats`) |
| `burstStats` | `BurstStats` | Per-author burst detection |
| `entropy` | `EntropyStats` | Per-author temporal irregularity |
| `churn` | `ChurnStats` | Per-author churn hotspots |
| `testCoupling` | `TestCouplingStats` | Per-author test coupling |
| `refactorBehavior` | `RefactorBehaviorStats` | Per-author refactor commit rate |
| `commitCalendar` | `CommitCalendar \| null` (optional) | Per-author Mon–Sun heatmap |
| `commitsPerWeek` | `number` (optional) | Commits per week in the recent window, aligned with `git.commitsPerWeek` (last 13 weeks) |

## `github` — GitHub repository metadata (optional)

Produced by `collect/githubRepoMeta` via the GitHub REST API, and only from the
`analyzeFromGitHubUrl` entry point.

**This field is absent in two very different situations, and the report cannot
distinguish them:**

1. The target was a local path, so there is no GitHub repository to describe.
2. The target *was* a GitHub URL but the API call failed — rate limit, missing
   or invalid `GITHUB_TOKEN`, private repository, or network error. The
   enrichment is wrapped in a `try`/`catch` that swallows the error, so nothing
   is logged and no flag is set.

Treat an absent `github` on a GitHub target as "unknown", never as "the
repository has no stars/topics/languages". Zeroed counts and a populated
`languages` array are the only evidence the fetch actually succeeded.

### `GitHubRepositoryMeta`

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string \| null` | Repository About text; `null` when the repo has none |
| `topics` | `string[]` | GitHub topics |
| `stargazersCount` | `number` | Stars |
| `forksCount` | `number` | Forks |
| `subscribersCount` | `number` | Users watching the repo |
| `languages` | `GitHubLanguageShare[]` | Language breakdown by bytes |
| `contributors` | `GitHubRepoContributor[]` | Contributors per the GitHub API — **not** the same as top-level `contributors`, which is derived from commit history. The two can disagree |

### `GitHubLanguageShare`

| Field | Type | Description |
|-------|------|-------------|
| `language` | `string` | Language name as GitHub reports it |
| `bytes` | `number` | Bytes attributed to this language |
| `percentage` | `number` | 0–100 with one decimal, same spirit as GitHub's language bar |

### `GitHubRepoContributor`

| Field | Type | Description |
|-------|------|-------------|
| `login` | `string` | GitHub username |
| `avatarUrl` | `string` | Avatar image URL |
| `htmlUrl` | `string` | Profile URL |
| `contributions` | `number` | Commit count per the GitHub contributors API |
| `name` | `string` (optional) | Display name from `GET /users/{login}`, when that lookup succeeded |

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
| `cyclomaticComplexity` | `number` | Cyclomatic complexity (same as `1 +` branch points + `&&`/`||`); aligns with `FunctionComplexity.complexity` |
| `halstead` | `HalsteadMetrics` | Halstead operator/operand metrics (lexical volume) |
| `cognitiveComplexity` | `number` | Additive cognitive score (nesting-aware; Sonar-style) |
| `maintainabilityIndexGradAiRaw` | `number` | GRAD-AI raw MI: `171 - 5.2·ln(V) - 0.23·CC - 16.2·ln(LOC)` (natural logs); `V` = Halstead `volume`, `CC` = cyclomatic, `LOC` = `lines` |
| `maintainabilityIndexGradAiNorm` | `number` | `max(0, MI_raw · 100 / 171)` — use for dashboards / cohort charts (0–100) |
| `isReactComponent` | `boolean` | Heuristic: `.tsx` file and (PascalCase name or JSX in body) |
| `isMonolithic` | `boolean` | `true` when `isReactComponent` and `lines` exceed the monolithic threshold (50 SLOC; see `constants.ts`) |

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

## `symbolVerificationRisks` — Complexity vs test proximity

Produced by `extract/symbolVerificationRisk`. Always emitted by current builds,
though it may be `[]`; absent in reports cached before the field existed.

One row per **named** function, pairing its cyclomatic complexity against
**static evidence that it is exercised by tests**.

This array is **not** one row per entry in `perFile[].functionMetrics`. Two
classes of function are skipped outright, because a name is what the heuristic
matches on:

- anonymous functions (`name === "(anonymous)"`)
- names shorter than 3 characters, which would match too much text by accident

So `symbolVerificationRisks.length` is normally well below
`totals.functions`, and the gap is largest in arrow-heavy or callback-heavy
codebases. Do not compute a "percentage of verified functions" against
`totals.functions` — the denominators are different populations.

> **`verificationScore` is not code coverage.** It is a filename-pairing and
> name-matching heuristic: it asks whether a conventionally named test file
> exists and whether the symbol's name appears inside it. It never executes
> anything and has no relationship to Istanbul, `c8`, or any runtime coverage
> tool. A high score means "a test file mentions this name", which a test can
> satisfy without asserting anything about the function. Do not report it as a
> coverage figure.

An empty array means either that no functions were found or that the pairing
step found nothing to compare — it is not evidence that the repository is
untested.

### `SymbolVerificationRisk`

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path relative to `repoPath` |
| `name` | `string` | Function name. Never `"(anonymous)"` and never shorter than 3 characters — those rows are not emitted |
| `startLine` | `number` | 1-based line number |
| `cyclomaticComplexity` | `number` | Same value as the matching `FunctionDetail.cyclomaticComplexity` |
| `verificationScore` | `number` | Strength of the static evidence. **Discrete, not continuous**: exactly `0`, `0.3`, or `1` — one per `evidence` value below |
| `evidence` | `VerificationEvidence` | Which rule produced the score (see below) |
| `pairedTestPath` | `string` (optional) | Matched test file, when a conventional pair exists. Absent when `evidence` is `"none"` |
| `riskScore` | `number` | `min(cyclomaticComplexity, 50) × (1 − verificationScore)`, for sorting and heat maps. Complexity is capped at 50 so one enormous function cannot dominate the ranking |

### `VerificationEvidence`

| Value | `verificationScore` | Meaning |
|-------|---------------------|---------|
| `"referenced_in_test"` | `1` | A paired test file exists **and** the symbol's name appears in it as a whole word — strongest evidence |
| `"paired_file_only"` | `0.3` | A conventionally named test file exists but does not mention this symbol |
| `"none"` | `0` | No paired test file found |

Because the score is one of three fixed values, `riskScore` is likewise
quantised: for a given complexity it takes only three possible values
(`cc × 1`, `cc × 0.7`, `cc × 0`). Treat it as an ordering key, not a continuous
risk measure.

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
| `tsxFilesAnalyzed` | `number` | Count of `.tsx` and `.jsx` files included |
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

Present when the analyzer build includes Phase 3. **Silent failure** events are collected from **`.tsx`** files only (empty `catch` or `catch` that only logs to console). **SRS** uses jscpd duplicate pairs with per-pair similarity (file excerpt + Levenshtein ratio when fragments are unavailable); see [METRICS_CONCEPTS.md](METRICS_CONCEPTS.md).

### `SilentFailureEvent`

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path relative to repo root |
| `line` | `number` | 1-based line (catch keyword) |
| `kind` | `string` | `empty_catch` or `console_only_catch` |

### `Phase3Metrics`

| Field | Type | Description |
|-------|------|-------------|
| `sfd` | `number` | Silent failure density: `silentFailureEvents.length / (profile.sourceLOC / 1000)`; `0` if `sourceLOC === 0` |
| `mcr` | `number \| null` | Monolithic component rate: `monolithicComponentCount / reactComponentCount`; **`null`** if `reactComponentCount === 0` |
| `srs` | `number` | Structural redundancy score: `srsWeightedNumerator / (profile.sourceLOC / 1000)`; `0` if `sourceLOC === 0` |
| `silentFailureEvents` | `SilentFailureEvent[]` | All TSX silent-failure events |
| `srsWeightedNumerator` | `number` | Sum of weighted duplicate line mass (1.0 @ 100% similarity, 0.5 for similarity in (80%, 100%), 0 otherwise) |
| `srsExactWeightedLines` | `number` | Portion of numerator from 100% matches |
| `srsNearWeightedLines` | `number` | Portion of numerator from (80%, 100%) near-clone matches |
| `monolithicComponentCount` | `number` | React components with `lines` > threshold |
| `reactComponentCount` | `number` | Functions with `isReactComponent === true` |
