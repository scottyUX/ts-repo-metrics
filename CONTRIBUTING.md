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
# Single repo analysis
npm run dev -- /path/to/repo

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

## Pull Request Workflow

1. Create a feature branch from `main`: `git checkout -b feature/your-feature`
2. Implement the feature with JSDoc and schema updates
3. Run `npm run dev -- /path/to/repo` and verify output
4. Commit with a descriptive message referencing the issue number
5. Push and open a PR against `main`

## Commit Message Format

```
<verb> <description> (#<issue>)

<optional body explaining why>
```

Examples:
- `Add cyclomatic complexity analysis (#3)`
- `Refactor shared constants into src/utils/constants.ts`
