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
| `functionMetricsSummary` | AST | Avg/median function length, max nesting, long function % |
| `complexity` | AST | Cyclomatic complexity (avg, max, high-complexity count) |
| `smells` | AST | Long functions, deep nesting, long params, empty catches, console logs |
| `maintainability` | Composite | Maintainability Index (0–100) from LOC + complexity + function length |
| `testCoverageProxy` | LOC | testLOC / sourceLOC ratio and classification |
| `duplication` | jscpd | Duplicate percentage, lines, clone clusters |
| `git` | simple-git | Commit count, sizes, frequency, large commit ratio |
| `framework` | package.json | React, Next.js, Express, NestJS, Fastify, or Node |

## Project Structure

```
src/
├── cli.ts                          # CLI entrypoint (single + batch)
├── batch/
│   └── batchAnalyze.ts             # Multi-repo batch analysis
├── collect/
│   ├── fileDiscovery.ts            # Finds .ts/.tsx files via fast-glob
│   ├── loc.ts                      # Repository profiling (LOC + file types)
│   ├── duplication.ts              # jscpd code duplication detection
│   ├── gitClone.ts                 # Clone GitHub repos with cache
│   ├── gitMetrics.ts               # Git history metrics via simple-git
│   ├── repoMetadata.ts             # Source metadata (commit, branch)
│   └── frameworkDetection.ts       # Framework detection from package.json
├── parsing/
│   └── tsParser.ts                 # Tree-sitter wrapper (TS & TSX grammars)
├── extract/
│   ├── functionCount.ts            # Counts functions by AST node type
│   ├── functionMetrics.ts          # Per-function line count, nesting, params
│   ├── complexity.ts               # Cyclomatic complexity per function
│   ├── smells.ts                   # Structural code smell detectors
│   ├── testCoverageProxy.ts        # Test LOC / source LOC ratio
│   └── maintainabilityIndex.ts     # Composite MI score
├── pipeline/
│   └── analyzeRepo.ts              # Orchestrates the full analysis pipeline
├── types/
│   └── report.ts                   # Shared TypeScript interfaces (RepoReport)
└── utils/
    ├── constants.ts                # Shared constants and thresholds
    ├── githubUrl.ts                # GitHub URL parsing and validation
    ├── math.ts                     # Numeric utilities (median)
    └── text.ts                     # Text utilities (line counting)
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
| `dev` | `tsx src/cli.ts` | Run directly from TypeScript |
| `build` | `tsc -p tsconfig.json` | Compile to JavaScript in `dist/` |
| `start` | `node dist/cli.js` | Run the compiled build |
| `test` | `vitest run` | Run tests once |
| `test:watch` | `vitest` | Run tests in watch mode |

## License

ISC
