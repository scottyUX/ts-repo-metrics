# ts-repo-metrics

A TypeScript CLI tool that statically analyzes TypeScript and TSX repositories using [Tree-sitter](https://tree-sitter.github.io/tree-sitter/), producing a comprehensive JSON report covering repository profiling, function metrics, cyclomatic complexity, code smells, duplication, git history, extended git metrics (Epic D: commit size distribution, bursts, entropy, churn hotspots, test coupling, refactor rate), framework detection, maintainability index, and test coverage proxy.

## Prerequisites

- Node.js >= 18
- npm
- Vitest (installed as devDependency for tests)

## Install

```bash
git clone https://github.com/scottyUX/ts-repo-metrics.git
cd ts-repo-metrics
npm install
```

## Usage

### Single Repository

Local path (or legacy: path as first arg):

```bash
npm run dev -- analyze /absolute/path/to/target/repo
npm run dev -- /path/to/repo   # legacy shorthand
```

GitHub public repo URL (clones into `.cache/ts-repo-metrics/`):

```bash
npm run dev -- analyze https://github.com/user/repo [--no-cache]
```

| Flag | Description |
|------|-------------|
| `--no-cache` | Force a fresh clone instead of reusing cached clone |

### Batch Mode

Analyze every sub-directory under a parent folder that contains a `package.json`:

```bash
npm run dev -- batch /path/to/repos-folder --output ./reports --csv
```

| Flag | Description |
|------|-------------|
| `--output <dir>` | Directory for individual JSON reports (default: `<parent>/reports`) |
| `--csv` | Also produce a `summary.csv` with one row per repo |

### Example Output (single repo)

When run via the engine (CLI or dashboard), `analyzer_version` is the engine package version (e.g. `0.0.0`).

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
  "filesSkipped": 0,
  "analyzer_version": "0.0.0",
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
| `git` | simple-git | Commit count, sizes, frequency, large commit ratio |
| `framework` | package.json | React, Next.js, Express, NestJS, Fastify, or Node |

## Dashboard

A Next.js dashboard app in `apps/dashboard/` provides a web UI:

- Analyze public GitHub repos from URL
- RQ-driven results (RQ1 Behavioral Shift, RQ2 Verification & Engagement, RQ3 Quality Outcomes)
- Dataset tab: metadata, feature vector, data dictionary, export

Run with `npm run dashboard` (starts `next dev` in `apps/dashboard/`).

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
│       │   ├── collect/            # fileDiscovery, loc, duplication, gitClone, gitMetrics, repoMetadata, frameworkDetection
│       │   ├── parsing/            # tsParser (Tree-sitter)
│       │   ├── extract/           # functionCount, functionMetrics, complexity, smells, testCoverageProxy, maintainabilityIndex, distributions
│       │   ├── types/              # report.ts (RepoReport, etc.)
│       │   └── utils/              # constants, githubUrl, math, text, astWalker
│       └── __tests__/              # Engine test suite (+ fixtures)
└── apps/
    └── dashboard/                  # Next.js app; /api/analyze imports engine
```

## How It Works

1. **Profile** — Counts files by type and computes LOC breakdowns before parsing.
2. **Discover** — `fast-glob` finds all `.ts`/`.tsx` files, ignoring non-source directories.
3. **Parse** — Each file is parsed into a CST using Tree-sitter (TypeScript or TSX grammar).
4. **Extract** — Multiple extractors run on each parsed tree:
   - Function count and type breakdown
   - Per-function metrics (length, nesting depth, parameter count)
   - Cyclomatic complexity per function
   - Code smell detection (5 detectors)
5. **Collect** — Non-AST modules gather duplication (jscpd), git history (simple-git), and framework info (package.json).
6. **Aggregate** — Pipeline combines all results into a typed `RepoReport`, computes composite metrics (maintainability index, test coverage proxy).
7. **Report** — JSON output to stdout (single mode) or individual files + optional CSV (batch mode).

## Documentation

- [Architecture overview](docs/ARCHITECTURE.md)
- [Full JSON schema reference](docs/SCHEMA.md)
- [Contributing guide](CONTRIBUTING.md)
- [Sprint planning](docs/planning/) — roadmap and epic specifications

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx src/cli.ts` | Run CLI from TypeScript |
| `build` | `tsc -p tsconfig.json` | Compile root CLI to `dist/` |
| `start` | `node dist/cli.js` | Run the compiled CLI |
| `dashboard` | `cd apps/dashboard && npm run dev` | Start Next.js dashboard |
| `dashboard:build` | Build engine then Next | Build `packages/engine` then `apps/dashboard` (for production/Vercel) |
| `test` | `vitest run` | Run engine test suite (`packages/engine/__tests__/`) |
| `test:watch` | `vitest` | Run tests in watch mode |

## License

ISC
