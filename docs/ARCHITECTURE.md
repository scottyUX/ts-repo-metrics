# Architecture

This document describes the module structure and data flow of `ts-repo-metrics`.

## Overview: One Engine, Two Entry Points

The analysis logic lives in a single **engine** package. The **CLI** and the **dashboard API** both import from the engine; nothing is spawned.

```
                    ┌─────────────────────────────┐
                    │  packages/engine             │
                    │  (pipeline, collect,        │
                    │   parsing, extract, types,   │
                    │   utils)                     │
                    │  Exports: analyzeRepo,       │
                    │  analyzeFromGitHubUrl, etc.  │
                    └──────────────┬──────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼                       ▼
   ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
   │ src/cli.ts    │       │ batch/       │       │ apps/dashboard│
   │ (thin wrapper)│       │ batchAnalyze │       │ /api/analyze  │
   │               │       │ (uses engine)│       │ (imports       │
   │ - URL →       │       │              │       │  engine)      │
   │   analyzeFrom │       │              │       │               │
   │   GitHubUrl   │       │              │       │ - no spawn    │
   │ - path →      │       │              │       │ - cacheDir    │
   │   getSource   │       │              │       │   e.g.        │
   │   Metadata +  │       │              │       │   os.tmpdir() │
   │   analyzeRepo │       │              │       │               │
   └───────────────┘       └───────────────┘       └───────────────┘
```

## Pipeline Overview

- **CLI** (`src/cli.ts`): Parses args; for GitHub URLs calls `analyzeFromGitHubUrl`, for local paths calls `getSourceMetadata` + `analyzeRepo`; batch mode calls `batchAnalyze` (which uses `analyzeRepo` from the engine).
- **Dashboard** (`apps/dashboard/app/api/analyze/route.ts`): Validates URL, calls `analyzeFromGitHubUrl(normalizedUrl, { useCache: true, cacheDir })` with `cacheDir = os.tmpdir()` on Vercel, returns the report.

## GitHub URL Support

- **Engine** provides `analyzeFromGitHubUrl(url, { useCache?, cacheDir? })`: normalizes URL, parses with `parseGitHubUrl`, clones via `cloneOrUseCache(parsed, useCache, cacheDir)`, then `getSourceMetadata` + `analyzeRepo`.
- **CLI** and **API** use this; no subprocess or tsx.

### Zipball and API fallback (Vercel)

When `cloneOrUseCache` fails because the git binary is unavailable (e.g. on Vercel), the engine calls `downloadZipball` instead. The extracted path has no `.git` directory, so `extractGitMetrics` and `extractGitMetricsV2` return null. `analyzeFromGitHubUrl` then calls `extractGitMetricsApi(parsed, GITHUB_TOKEN)` to populate `report.git` from the GitHub REST API. API-derived metrics are proxies (commit metadata only; no diff stats such as lines changed).

## Data Flow (Engine Internals)

```
                    ┌──────────────────────────────┐
                    │  pipeline/analyzeRepo.ts     │
                    │  (orchestrator)             │
                    └──────────────┬──────────────┘
                                    │
    ┌──────────────┬────────────────┼────────────────┬──────────────┐
    ▼              ▼                ▼                ▼              ▼
┌──────────┐ ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ collect/ │ │ parsing/ │   │ extract/ │   │ extract/ │   │ extract/ │
│ loc,     │ │ tsParser │   │ fnCount  │   │ complex. │   │ smells,  │
│ fileDis.,│ │          │   │ fnMetric │   │ distrib. │   │ testCov,  │
│ dup,     │ │          │   │ maintIdx │   │          │   │          │
│ git,     │ │          │   │          │   │          │   │          │
│ gitMetApi│ │          │   │          │   │          │   │          │
│ gitClone,│ │          │   │          │   │          │   │          │
│ fwDetect │ │          │   │          │   │          │   │          │
└──────────┘ └──────────┘   └──────────┘   └──────────┘   └──────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │  types/report.ts (RepoReport)  │
                    └──────────────────────────────┘
```

## Module Responsibilities

| Location | Purpose |
|----------|---------|
| `packages/engine` | Pure analysis: pipeline, collect, parsing, extract, types, utils. Builds to `dist/`. Consumed by CLI and dashboard. |
| `packages/engine/src/index.ts` | Exports `analyzeRepo`, `analyzeFromGitHubUrl`, `getSourceMetadata`, `parseGitHubUrl`, and key types. |
| `packages/engine/src/collect/gitMetricsApi.ts` | GitHub REST API fallback for git metrics when git CLI unavailable (Vercel zipball mode). |
| `src/cli.ts` | CLI entrypoint — imports from `@repo-metrics/engine`; routes single (URL vs path) and batch. |
| `src/batch/` | Batch analysis over multiple repos; imports `analyzeRepo` and `RepoReport` from the engine. |

## Adding a New Extractor

1. **Define the type** in `packages/engine/src/types/report.ts` and add the field to `RepoReport`.
2. **Create the extractor** in `packages/engine/src/extract/` (AST-based) or `packages/engine/src/collect/`.
3. **Add constants/thresholds** to `packages/engine/src/utils/constants.ts`.
4. **Integrate** in `packages/engine/src/pipeline/analyzeRepo.ts`.
5. **Update docs** — `docs/SCHEMA.md`, `README.md`.

## Build and Test

- **Engine**: `cd packages/engine && npm run build` (output in `dist/`). Tests: `packages/engine/__tests__/`; run from root with `npm run test` or from engine with `npm run test`.
- **Dashboard**: `npm run build` from `apps/dashboard` runs `build:engine` then `next build`. The API route uses `@repo-metrics/engine` (no spawn).

## Shared Code Rules

- Reusable constants → `packages/engine/src/utils/constants.ts`
- Reusable utilities → `packages/engine/src/utils/<topic>.ts`
- Shared interfaces → `packages/engine/src/types/report.ts`
