# Architecture

This document describes the module structure and data flow of `ts-repo-metrics`.

## Pipeline Overview

```
CLI (src/cli.ts)
 │
 ├─ Single mode:  analyzeRepo(repoPath) → JSON to stdout
 └─ Batch mode:   batchAnalyze(opts) → JSON per repo + optional CSV
```

## GitHub URL Support

Single-mode accepts `https://github.com/owner/repo` URLs. The CLI:
1. Validates URL format (`parseGitHubUrl`)
2. Clones to `.cache/ts-repo-metrics/<owner-repo>` (full clone, no shallow)
3. Reuses cached clone unless `--no-cache`
4. Reports `source.type: "git"` with url, commit, branch

## Data Flow

```
                          ┌─────────────────────┐
                          │      cli.ts          │
                          │  (parse args, route) │
                          └──────────┬───────────┘
                                     │
                          ┌──────────▼───────────┐
                          │  pipeline/            │
                          │  analyzeRepo.ts       │
                          │  (orchestrator)       │
                          └──────────┬───────────┘
                                     │
         ┌──────────────┬────────────┼────────────┬──────────────┐
         ▼              ▼            ▼            ▼              ▼
   ┌──────────┐  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ collect/ │  │ parsing/ │ │ extract/ │ │ extract/ │ │ extract/ │
   │ loc.ts   │  │ tsParser │ │ fnCount  │ │ complex. │ │ smells   │
   │ fileDis. │  │          │ │ fnMetric │ │ distrib. │ │ testCov  │
   │ dup.ts   │  │          │ │ maintIdx │ │          │ │          │
   │ git.ts   │  │          │ │          │ │          │ │          │
   │ fwDetect │  │          │ │          │ │          │ │          │
   └──────────┘  └──────────┘ └──────────┘ └──────────┘ └──────────┘
         │              │            │            │              │
         └──────────────┴────────────┼────────────┴──────────────┘
                                     ▼
                          ┌──────────────────────┐
                          │  types/report.ts      │
                          │  (RepoReport)         │
                          └──────────────────────┘
```

## Module Responsibilities

| Directory | Purpose |
|-----------|---------|
| `src/cli.ts` | CLI entrypoint — argument parsing, routing single vs batch mode |
| `src/pipeline/` | Orchestrates the full analysis: profile → discover → parse → extract → aggregate |
| `src/collect/` | Data collection modules that don't require AST parsing (LOC, file discovery, duplication, git, framework) |
| `src/parsing/` | Tree-sitter wrapper for TS/TSX parsing |
| `src/extract/` | AST-based extractors (function count, metrics, complexity, smells, test coverage proxy, maintainability index) |
| `src/batch/` | Batch analysis over multiple repos |
| `src/types/` | Shared TypeScript interfaces for the report |
| `src/utils/` | Shared constants, math utilities, text utilities, AST walker |

## Adding a New Extractor

1. **Define the type** in `src/types/report.ts` and add the field to `RepoReport`.
2. **Create the extractor** in `src/extract/` (AST-based) or `src/collect/` (non-AST).
3. **Add constants/thresholds** to `src/utils/constants.ts`.
4. **Integrate** in `src/pipeline/analyzeRepo.ts` — call the extractor and add the result to the return object.
5. **Update docs** — `docs/SCHEMA.md` field reference, `README.md` example output.

## Distribution Metrics (`extract/distributions.ts`)

Computes tail-risk indicators for research:
- **Percentiles**: p50/p75/p90 for function length and cyclomatic complexity
- **Concentration**: `percent_high_complexity_in_top_10_percent_files` — what fraction of high-complexity functions (>10) reside in the top 10% of files by total complexity

Used by the dashboard's RQ3 Quality Outcomes tab and Dataset feature vector.

## AST Walker

All AST-based extractors use the shared `walkTree()` utility from `src/utils/astWalker.ts`. This ensures:

- Consistent traversal order (reverse document order for compatibility)
- Support for enter/leave callbacks
- Skip-children via `return SKIP` from `enter`
- Reduced duplication across complexity, functionMetrics, smells, and functionCount

## Shared Code Rules

Per `.cursor/rules/shared-code-organization.mdc`:

- Reusable constants → `src/utils/constants.ts`
- Reusable utilities → `src/utils/<topic>.ts`
- Shared interfaces → `src/types/report.ts`
- Feature-private helpers may stay local if unexported.
