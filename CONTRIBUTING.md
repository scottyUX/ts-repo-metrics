# Contributing

Thanks for your interest in `ts-repo-metrics`! This guide covers setup, conventions, and the workflow for adding new features.

## Development Setup

```bash
git clone https://github.com/scottyUX/ts-repo-metrics.git
cd ts-repo-metrics
npm install
```

### Running Locally

```bash
# Single repo (local path)
npm run dev -- analyze /path/to/repo
npm run dev -- /path/to/repo   # legacy shorthand

# Single repo (GitHub URL)
npm run dev -- analyze https://github.com/user/repo [--no-cache]

# Batch mode
npm run dev -- batch /path/to/repos --output ./reports --csv
```

### Building

```bash
npm run build     # Compiles to dist/
npm start -- /path/to/repo
```

## Project Structure

```
src/
├── cli.ts                          # CLI entrypoint (single + batch routing)
├── batch/batchAnalyze.ts           # Batch analysis over multiple repos
├── collect/                        # Non-AST data collection
│   ├── fileDiscovery.ts
│   ├── loc.ts
│   ├── duplication.ts
│   ├── gitMetrics.ts
│   ├── gitMetricsApi.ts
│   └── frameworkDetection.ts
├── parsing/tsParser.ts             # Tree-sitter wrapper
├── extract/                        # AST-based extractors
│   ├── functionCount.ts
│   ├── functionMetrics.ts
│   ├── complexity.ts
│   ├── smells.ts
│   ├── testCoverageProxy.ts
│   └── maintainabilityIndex.ts
├── pipeline/analyzeRepo.ts         # Orchestrator
├── types/report.ts                 # Shared interfaces
└── utils/                          # Shared constants and helpers
    ├── constants.ts
    ├── math.ts
    └── text.ts
```

## Adding a New Metric

1. **Define the interface** in `src/types/report.ts` and add the field to `RepoReport`.
2. **Add any constants/thresholds** to `src/utils/constants.ts`.
3. **Create the extractor** in `src/extract/` (AST-based) or `src/collect/` (file/subprocess-based).
4. **Integrate** in `src/pipeline/analyzeRepo.ts` — import, call, include in the return object.
5. **Update documentation**:
   - JSDoc on all exported functions (`@param`, `@returns`)
   - Add a section to `docs/SCHEMA.md`
   - Update `README.md` example output

## Code Conventions

- **TypeScript** with `strict: true`, `NodeNext` module resolution
- **Imports** use `.js` extensions (required by NodeNext)
- **Shared code rule**: reusable constants, utilities, and types go in `src/utils/` and `src/types/`, not in feature files. See `.cursor/rules/shared-code-organization.mdc`.
- **JSDoc** on all exported functions with `@param` and `@returns`
- **No inline comments** that just narrate what the code does

## Testing

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
```

### Test Conventions

- **Location**: Unit tests live next to the code they test as `*.test.ts` in `src/__tests__/` (e.g. `src/__tests__/math.test.ts` for `src/utils/math.ts`).
- **Structure**: Use `describe` for the module/function and `it` for specific cases. Include normal, edge, and complex cases where applicable.
- **Determinism**: All tests must be deterministic. Avoid `Date.now()`, random values, or environment-dependent logic without mocking.

### Snapshot Tests

Snapshot tests capture the full `analyzeRepo()` output for a fixture repo to ensure JSON structure stability.

- **Fixture**: `src/__tests__/fixtures/sample-repo/` — a minimal TypeScript repo (no `.git`).
- **Update snapshots**: Run `npx vitest run --update` when the report schema or extractors intentionally change.
- **Volatile fields**: The snapshot test normalizes `repoPath` and handles `git`/`duplication` so snapshots remain machine-independent.
- **Workflow**: If a change intentionally alters the report structure, update the snapshot and commit it with the code change. CI fails on snapshot mismatch to catch accidental regressions.

## Pull Request Workflow

1. Create a feature branch from `main`: `git checkout -b feature/your-feature`
2. Implement the feature with JSDoc and schema updates
3. Run `npm test` and `npm run dev -- /path/to/repo` to verify output
4. If the report schema changed, run `npx vitest run --update` to refresh snapshots
5. Commit with a descriptive message referencing the issue number
6. Push and open a PR against `main`

## Commit Message Format

```
<verb> <description> (#<issue>)

<optional body explaining why>
```

Examples:
- `Add cyclomatic complexity analysis (#3)`
- `Refactor shared constants into src/utils/constants.ts`
