# ts-repo-metrics

A TypeScript CLI tool that statically analyzes TypeScript, TSX, JavaScript, JSX, and Python repositories using [Tree-sitter](https://tree-sitter.github.io/tree-sitter/), producing a comprehensive JSON report covering repository profiling, function metrics, cyclomatic complexity, code smells, duplication, git history, extended git metrics (Epic D: commit size distribution, bursts, entropy, churn hotspots, test coupling, refactor rate), framework detection, maintainability index, test coverage proxy, **optional RQ3 React/TSX metrics** (`reactMetrics`: hooks, JSX depth, cohesion-style flags, prop pass-through MVP, hook-safety heuristics; emitted when `.tsx` or `.jsx` files are analyzed), and **optional Phase 3 pathology** (`phase3`: silent-failure density, monolithic component rate, weighted structural redundancy from jscpd).

## Prerequisites

- Node.js >= 18
- npm >= 7 (workspace support)
- Vitest (installed as devDependency for tests)

## Install

```bash
git clone https://github.com/scottyUX/ts-repo-metrics.git
cd ts-repo-metrics
npm install
```

That single command is enough — no second build step. This repo is an npm
workspace (`packages/engine`, `apps/dashboard`), so one root `npm install`
installs every package's dependencies, and a root `postinstall` compiles
`packages/engine` to `dist/`. The CLI and the dashboard both import
`@repo-metrics/engine` from that build output, so skipping it would leave
`npm run dev` failing with `MODULE_NOT_FOUND`.

## Usage

To run the `ts-repo-metrics` analysis tool, ensure you have the latest changes and dependencies, then execute the `dev` script with your desired analysis command.

1.  **Pull latest changes:**
    ```bash
    git pull origin main
    ```
2.  **Install dependencies (if needed):**
    ```bash
    npm install
    ```
3.  **Run analysis:**
    ```bash
    npm run dev -- analyze <local-path-to-repo>
    ```
    or
    ```bash
    npm run dev -- analyze https://github.com/user/repo
    ```
    The `dev` script will automatically build the necessary engine package before running the analysis.

### Example Output (single repo)

When run via the engine (CLI or dashboard), `analyzer_version` is the engine package version (e.g. `0.2.0`).

```json
{
  "repoPath": "/path/to/repo",
  "source": {
    "type": "local",
    "url": "",
    "commit": "abc123",
    "branch": "main"
  },
  "filesAnalyzed": 19,
  "analyzer_version": "0.2.0",
  "analysis_timestamp": "2025-02-22T12:00:00.000Z",
  "distributions": {
    "p50_function_length": 12,
    "p75_function_length": 24,
    "p90_function_length": 45,
    "p50_complexity": 1,
    "p75_complexity": 3,
    "p90_complexity": 6,
    "percent_high_complexity_in_top_10_percent_files": 85.2
  },
  "profile": {
    "totalFiles": 19,
    "tsFiles": 19,
    "tsxFiles": 0,
    "testFiles": 0,
    "totalLOC": 1535,
    "sourceLOC": 1535,
    "testLOC": 0
  },
  "totals": {
    "functions": 56
  },
  "functionMetricsSummary": {
    "totalFunctions": 56,
    "averageLength": 15.8,
    "medianLength": 8.5,
    "maxNestingDepth": 6,
    "longFunctionPercentage": 7.1
  },
  "complexity": {
    "average": 3.7,
    "max": 14,
    "highComplexityFunctions": 2
  },
  "smells": {
    "longFunctions": 4,
    "deepNesting": 2,
    "longParameterLists": 0,
    "emptyCatchBlocks": 0,
    "consoleLogs": 11
  },
  "maintainability": {
    "score": 68.9,
    "classification": "high"
  },
  "testCoverageProxy": {
    "ratio": 0,
    "classification": "low"
  },
  "duplication": {
    "percentage": 4.8,
    "duplicateLines": 2120,
    "cloneClusters": 63
  },
  "git": {
    "totalCommits": 25,
    "medianCommitSize": 179,
    "avgLinesPerCommit": 301.8,
    "largeCommitRatio": 14.3,
    "commitsPerWeek": 1.9
  },
  "framework": {
    "type": "Node",
    "hasReact": false,
    "hasBackend": false
  },
  "perFile": [ ... ]
}
```

When the repo contains `.tsx` files, the report also includes **`reactMetrics`** (per-component and summary aggregates for RQ3). See [docs/SCHEMA.md](docs/SCHEMA.md).

## Metrics at a Glance

| Section | Source | Description |
|---------|--------|-------------|
| `profile` | LOC counting | File counts, LOC (total/source/test) |
| `distributions` | `extract/distributions` | Tail risk: p50/p75/p90 for function length & complexity, concentration |
| `functionMetricsSummary` | AST | Avg/median function length, max nesting, long function % |
| `complexity` | AST | Cyclomatic complexity (avg, max, high-complexity count) |
| `smells` | AST | Long functions, deep nesting, long params, empty catches, console logs |
| `maintainability` | Composite | Maintainability Index (0–100) from LOC + complexity + function length |
| `testCoverageProxy` | LOC | testLOC / sourceLOC ratio and classification |
| `duplication` | jscpd | Duplicate percentage, lines, clone clusters |
| `git` | simple-git or GitHub API (fallback) | Commit count, sizes, frequency, large commit ratio. On Vercel (no git CLI), metrics come from the GitHub REST API when `GITHUB_TOKEN` is set. |
| `gitMetricsV2` | `collect/gitMetricsV2` | Epic D extended git metrics: `commitStats`, `burstStats`, `entropy`, `churn`, `refactorBehavior`, `testCoupling`, and `commitCalendar` when commit timestamps were available. `null` when no history was analyzed |
| `commitCalendar` | `collect/gitMetricsV2` or GitHub API | Mon–Sun × week commit heatmap (`grid`, `columnWeekStarts`, `busiestWeekdayIndex`). Top-level copy is populated when history came from the GitHub API only; consumers should prefer `gitMetricsV2?.commitCalendar ?? commitCalendar` |
| `contributors` | `collect/gitMetricsV2` | Per-contributor activity: commit count, lines added/deleted, test vs source churn and files touched, per-author `commitStats`. Present when history was analyzed (local git or API) |
| `symbolVerificationRisks` | `extract/symbolVerificationRisk` | Per-symbol complexity vs test proximity: `verificationScore` (0–1 static evidence, **not** Istanbul coverage), `evidence`, `pairedTestPath`, and `riskScore` = `min(cyclomatic, 50) × (1 − verificationScore)`. Omitted in older cached reports |
| `github` | GitHub REST API | Repository metadata for `github.com` targets: description, topics, stars, forks, watchers, language shares, contributors |
| `framework` | package.json | React, Next.js, Express, NestJS, Fastify, or Node |
| `analysisSkipped` | `collect/pythonFrameworkDetection` | Present **instead of** metrics when the target is an unsupported framework (`web2py` or `django`); carries `id` and a human-readable `message` |
| `reactMetrics` | `extract/react` (TSX only) | React/TSX: components with JSX, hooks, nested JSX depth, Ferreira/Tampere-style flags, prop pass-through MVP, hook-safety heuristics |
| `phase3` | `extract/silentFailures`, `collect/weightedRedundancy`, `functionMetrics` | Optional pathology block: silent-failure density (TSX), monolithic component rate, weighted structural redundancy (jscpd) |
| Per-function (in `perFile[].functionMetrics`) | `tokenScanner`, `halstead`, `cognitiveComplexity`, `utils/metrics` | Lexical / cognitive: Halstead volume, cyclomatic, cognitive complexity, GRAD-AI `MI_raw` / `MI_norm`, `isReactComponent` heuristic |

### What counts as a function

Every per-function metric is emitted for each node matching `FUNCTION_NODE_TYPES`
(`packages/engine/src/utils/constants.ts`):

`function_declaration`, `generator_function_declaration`, `method_definition`,
`arrow_function`, `function`, `function_expression`, `generator_function`.

`function_expression` is the node type tree-sitter-typescript 0.23 emits for
`const x = function () {}`; older tree-sitter-javascript grammars emit `function`
for the same construct, so both are listed. This matters for cross-corpus
comparison: before `function_expression` was recognized, function expressions
were absent from every metric **and** their bodies were counted into the
enclosing function's complexity instead. Reports generated before that fix
therefore undercount functions and overcount the complexity of their parents in
any codebase using `function () {}` expressions. See
[research/validation/findings.md](research/validation/findings.md) (D10).

### Failure modes: skipped files

`filesSkipped` counts files that were discovered but never parsed, so their
functions are absent from every metric in the report. Each one logs a named
reason to stderr — a skip is never silent:

| stderr reason | Meaning |
|---------------|---------|
| `could not read file` | The file could not be read from disk (permissions, broken symlink, disappeared mid-run) |
| `file_too_large_for_parser (<n> chars)` | The source exceeded the Tree-sitter read buffer. Should be unreachable: the parser now sizes its buffer to the source. If you see this, report it — it means whole files are missing from the metrics |
| `parse_error: <message>` | Tree-sitter rejected the source for some other reason |

Historically a file at or above 32,768 characters failed with a bare
`Invalid argument` and was counted as a generic skip, which silently removed
9.3% of this repository's functions from every metric. `filesSkipped` is
normally absent — the key is omitted entirely when nothing was skipped, so
there is no `0` to read. If it is present at all, the report describes less code
than the repository contains, so check the stderr log before comparing runs.

## Dashboard

A Next.js dashboard app in `apps/dashboard/` provides a web UI:

- **Home:** paste a public GitHub URL, or use **Analyze ts-repo-metrics** to run the analyzer on this repository in one click.
- **Results tabs** (plain labels, no RQ/phase codes): **Behavioral** (git workflow & churn), **Verification** (tests & risk profile), **Quality** (complexity, maintainability, duplication), **React & TSX** (hooks, JSX, cohesion heuristics), **Lexical** (per-function Halstead / cognitive / GRAD-AI MI, glossary, threshold calibration, traffic-light bands), **AI smells** (Phase 3 pathology KPIs when present), **Dataset** (metadata, feature vector, data dictionary, CSV/JSON export), **AI Usage** (upload session JSONL/JSON — client-side analysis; see [docs/AI_USAGE_LOGS.md](docs/AI_USAGE_LOGS.md)), **Documentation** (OpenAI-powered review of student planning docs — see [docs/DOC_REVIEW_AGENT.md](docs/DOC_REVIEW_AGENT.md)).
- **Metric help:** cards and tables include short tooltips and optional **help dialogs** (definitions and how values are computed) for derived metrics.

Run with `npm run dashboard` (starts `next dev` in `apps/dashboard/`). For Vercel deployment, set `GITHUB_TOKEN` to enable API-derived git metrics when the git CLI is unavailable.

**GitHub analysis & cache:** The API clones under `os.tmpdir()/repo-metrics-git-cache/` (not the app folder) so stale layouts do not poison results. Cached directories are reused only if they pass `git` validation (`checkIsRepo()`); corrupt or partial clones (e.g. interrupted download) are removed and re-cloned. Reused clones are checked against the remote tip and fetched + reset only when it changed, so reanalysis always reflects the latest commit; if the sync fails, the repo is re-cloned fresh. The CLI still uses `.cache/ts-repo-metrics/` under the current working directory unless you pass `--no-cache`.

## Project Structure

Analysis logic lives in a single **engine** package. The CLI and the dashboard both consume `@repo-metrics/engine`; no subprocess or tsx.

```
repo-metrics/
├── src/
│   ├── cli.ts                      # CLI entrypoint (single + batch)
│   └── batch/
│       └── batchAnalyze.ts         # Multi-repo batch analysis
├── packages/
│   └── engine/                     # @repo-metrics/engine (builds to dist/)
│       ├── src/
│       │   ├── pipeline/           # analyzeRepo, analyzeFromGitHubUrl
│       │   ├── collect/            # fileDiscovery, loc, duplication, gitClone, weightedRedundancy, gitMetrics, gitMetricsApi, repoMetadata, frameworkDetection
│       │   ├── parsing/            # sourceParser (grammar selection), tokenScanner (Halstead atoms)
│       │   ├── extract/           # functionCount, functionMetrics, complexity, halstead, cognitiveComplexity, smells, silentFailures, symbolVerificationRisk, testCoverageProxy, maintainabilityIndex, distributions, react/
│       │   ├── types/              # report.ts (RepoReport, etc.)
│       │   └── utils/              # constants, languageProfile, githubUrl, math, metrics, text, astWalker
│       └── __tests__/              # Engine test suite (+ fixtures)
└── apps/
    └── dashboard/                  # Next.js app; /api/analyze imports engine
```

## How It Works

1. **Profile** — Counts files by type and computes LOC breakdowns before parsing.
2. **Discover** — `fast-glob` finds all `.ts`/`.tsx`/`.js`/`.jsx`/`.py` files, ignoring non-source directories (`node_modules`, `dist`, `build`, `.next`, `out`, `coverage`, `.git`) and dot-directories.
3. **Parse** — Each file is parsed into a CST using Tree-sitter, selecting the grammar by extension (TypeScript, TSX, JavaScript, or Python). Files that fail to parse are skipped with a named reason — see [Failure modes](#failure-modes-skipped-files).
4. **Extract** — Multiple extractors run on each parsed tree:
   - Function count and type breakdown
   - Per-function metrics (length, nesting depth, parameter count)
   - Cyclomatic complexity per function
   - Code smell detection (5 detectors)
   - For each `.tsx` file: React RQ3 metrics (components, hooks, JSX depth, cohesion-style flags, hook safety)
5. **Collect** — Non-AST modules gather duplication (jscpd), git history (simple-git), and framework info (package.json).
6. **Aggregate** — Pipeline combines all results into a typed `RepoReport`, computes composite metrics (maintainability index, test coverage proxy, optional `reactMetrics`, optional `phase3`).
7. **Report** — JSON output to stdout (single mode) or individual files + optional CSV (batch mode).

## Documentation

- [Architecture overview](docs/ARCHITECTURE.md)
- [AI Usage session logs (dashboard)](docs/AI_USAGE_LOGS.md)
- [Documentation review agent (dashboard)](docs/DOC_REVIEW_AGENT.md)
- [Full JSON schema reference](docs/SCHEMA.md)
- [Contributing guide](CONTRIBUTING.md)
- [Sprint planning](docs/planning/) — roadmap and epic specifications
- [AI session log analyzer (planned)](docs/planning/AI_SESSION_LOG_ANALYZER.md) — JSONL metrics, enrichment bridge table, join model
- [RQ3 React/TSX implementation (Phase 1)](docs/planning/RQ3_REACT_METRICS_IMPLEMENTATION.md)
- [Metrics concepts & citations (Phase 2)](docs/METRICS_CONCEPTS.md)

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build:engine` | `cd packages/engine && npm run build` | Builds the `@repo-metrics/engine` package |
| `dev` | `npm run build:engine && tsx src/cli.ts` | Runs CLI from TypeScript after building the engine |
| `build` | `tsc -p tsconfig.json` | Compile root CLI to `dist/` |
| `build:engine` | `cd packages/engine && npm run build` | Compile `packages/engine` to `dist/` |
| `postinstall` | `npm run build:engine` | Runs automatically after `npm install` so the engine is built and the CLI is immediately runnable |
| `start` | `node dist/cli.js` | Run the compiled CLI |
| `dashboard` | `cd apps/dashboard && npm run dev` | Start Next.js dashboard |
| `dashboard:build` | Build engine then Next | Build `packages/engine` then `apps/dashboard` (for production/Vercel) |
| `test` | `vitest run` | Run the full suite: engine tests and dashboard tests (`packages/engine/__tests__/`, `apps/dashboard/__tests__/`). Both are covered by a single root `npm install` — the workspace setup installs the dashboard's dependencies, which three of its test files need |
| `test:watch` | `vitest` | Run tests in watch mode |

## License

MIT — see [LICENSE](LICENSE).
