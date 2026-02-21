# ts-repo-metrics

A TypeScript CLI tool that statically analyzes TypeScript and TSX repositories using [Tree-sitter](https://tree-sitter.github.io/tree-sitter/), producing a JSON report with repository profiling (LOC and file type breakdown), function counts, and per-file breakdowns by function type.

## Prerequisites

- Node.js >= 18
- npm

## Install

```bash
git clone https://github.com/scottyUX/ts-repo-metrics.git
cd ts-repo-metrics
npm install
```

## Usage

Point the CLI at any local TypeScript/React/Next.js repo:

```bash
npm run dev -- /absolute/path/to/target/repo
```

### Example output

```json
{
  "repoPath": "/path/to/repo",
  "filesAnalyzed": 5,
  "profile": {
    "totalFiles": 5,
    "tsFiles": 5,
    "tsxFiles": 0,
    "testFiles": 0,
    "totalLOC": 120,
    "sourceLOC": 120,
    "testLOC": 0
  },
  "totals": {
    "functions": 7
  },
  "perFile": [
    {
      "file": "src/cli.ts",
      "functions": 2,
      "functionsByType": {
        "function_declaration": 1,
        "arrow_function": 1,
        "method_definition": 0,
        "generator_function_declaration": 0,
        "function": 0,
        "generator_function": 0
      }
    }
  ]
}
```

## Project structure

```
src/
├── cli.ts                      # CLI entrypoint
├── collect/
│   ├── fileDiscovery.ts        # Finds .ts/.tsx files via fast-glob
│   └── loc.ts                  # Repository profiling (LOC + file type breakdown)
├── parsing/
│   └── tsParser.ts             # Tree-sitter wrapper (TS & TSX grammars)
├── extract/
│   └── functionCount.ts        # Counts functions by AST node type
└── pipeline/
    └── analyzeRepo.ts          # Orchestrates profile → discovery → parse → extract
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx src/cli.ts` | Run directly from TypeScript (no build step) |
| `build` | `tsc -p tsconfig.json` | Compile to JavaScript in `dist/` |
| `start` | `node dist/cli.js` | Run the compiled build |

## How it works

1. **Profile** — Counts files by type (`.ts`, `.tsx`, test) and computes LOC breakdowns (total, source, test) before any parsing begins.
2. **Discover** — `fast-glob` finds all `.ts` and `.tsx` files, ignoring `node_modules`, `dist`, `build`, `.next`, and other non-source directories.
3. **Parse** — Each file is parsed into a concrete syntax tree using Tree-sitter with the appropriate grammar (TypeScript or TSX).
4. **Extract** — An iterative depth-first traversal counts function-like AST nodes: `function_declaration`, `arrow_function`, `method_definition`, `function`, `generator_function_declaration`, and `generator_function`.
5. **Report** — Results are aggregated into a JSON report with profile, totals, and per-file breakdowns.

## License

ISC
