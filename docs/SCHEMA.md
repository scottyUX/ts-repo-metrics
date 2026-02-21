# Output Schema Reference

This document describes the JSON report produced by `ts-repo-metrics`.

## Top-level structure

| Field | Type | Description |
|-------|------|-------------|
| `repoPath` | `string` | Absolute path to the analyzed repository |
| `filesAnalyzed` | `number` | Total number of `.ts`/`.tsx` files parsed |
| `profile` | `RepoProfile` | File counts and LOC breakdown (see below) |
| `totals` | `object` | Aggregate metrics across all files |
| `totals.functions` | `number` | Total function-like nodes in the repo |
| `perFile` | `PerFileEntry[]` | Per-file metrics (see below) |

## `profile` — Repository Profiling

Computed before AST analysis. Provides high-level repository statistics.

| Field | Type | Description |
|-------|------|-------------|
| `totalFiles` | `number` | Total `.ts` + `.tsx` files (excluding ignored dirs) |
| `tsFiles` | `number` | Count of `.ts` files |
| `tsxFiles` | `number` | Count of `.tsx` files |
| `testFiles` | `number` | Files matching `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx` |
| `totalLOC` | `number` | Total lines of code across all files |
| `sourceLOC` | `number` | Lines of code in non-test files |
| `testLOC` | `number` | Lines of code in test files |

## `perFile` — Per-File Entry

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path relative to `repoPath` |
| `functions` | `number` | Total function-like nodes in the file |
| `functionsByType` | `Record<string, number>` | Breakdown by AST node type |

### `functionsByType` keys

| Key | Description |
|-----|-------------|
| `function_declaration` | Named function declarations |
| `generator_function_declaration` | Named generator function declarations |
| `method_definition` | Class/object methods (including getters, setters, constructors) |
| `arrow_function` | Arrow function expressions |
| `function` | Anonymous function expressions |
| `generator_function` | Anonymous generator function expressions |
