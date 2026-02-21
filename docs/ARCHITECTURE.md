# Architecture

This document describes the module structure and data flow of `ts-repo-metrics`.

## Pipeline Overview

```
CLI (src/cli.ts)
 │
 ├─ Single mode:  analyzeRepo(repoPath) → JSON to stdout
 └─ Batch mode:   batchAnalyze(opts) → JSON per repo + optional CSV
```

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
   │ fileDis. │  │          │ │ fnMetric │ │          │ │ testCov  │
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
| `src/utils/` | Shared constants, math utilities, text utilities |

## Adding a New Extractor

1. **Define the type** in `src/types/report.ts` and add the field to `RepoReport`.
2. **Create the extractor** in `src/extract/` (AST-based) or `src/collect/` (non-AST).
3. **Add constants/thresholds** to `src/utils/constants.ts`.
4. **Integrate** in `src/pipeline/analyzeRepo.ts` — call the extractor and add the result to the return object.
5. **Update docs** — `docs/SCHEMA.md` field reference, `README.md` example output.

## Shared Code Rules

Per `.cursor/rules/shared-code-organization.mdc`:

- Reusable constants → `src/utils/constants.ts`
- Reusable utilities → `src/utils/<topic>.ts`
- Shared interfaces → `src/types/report.ts`
- Feature-private helpers may stay local if unexported.
