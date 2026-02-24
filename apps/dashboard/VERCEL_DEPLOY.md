# Deploying the Dashboard to Vercel

The **Analyze** feature runs in-process: the API route imports `@repo-metrics/engine` and calls `analyzeFromGitHubUrl()`. No CLI spawn or tsx.

## Vercel project settings

1. **Root Directory**: Set to `apps/dashboard` so Next.js is detected.
2. **Include source files outside of Root Directory**: Enable this so the build can access `packages/engine` (the dashboard depends on it via `file:../../packages/engine`).
3. **Build command**: Use the default or `npm run build`. The dashboard’s `build` script runs `build:engine` (build the engine to `dist/`) then `next build`.
4. **Install command**: Ensure the full repo is installed so the engine is available. For example, from repo root: `npm install` then `cd apps/dashboard && npm install`, or set Vercel’s install command to run from repo root and install dashboard deps (so `file:../../packages/engine` resolves).

## Build order

1. Install: root and/or dashboard so `@repo-metrics/engine` is linked.
2. Build engine: `cd packages/engine && npm run build` (produces `dist/`).
3. Build Next: `cd apps/dashboard && npm run build`.

The dashboard’s `npm run build` does steps 2 and 3 via `build:engine` then `next build`.

## Runtime

- The analyze API route uses `export const runtime = "nodejs"` and `analyzeFromGitHubUrl(url, { useCache: true, cacheDir: os.tmpdir() })` so the clone cache is writable on Vercel.
- Native modules (`tree-sitter`, `tree-sitter-typescript`) are listed in `serverExternalPackages` in `next.config.ts` so they are not bundled.

## Deploy from repo root

```bash
cd /path/to/repo-metrics
npx vercel --prod
```

Ensure the project is linked to the repo (e.g. `.vercel/project.json` in repo root) and Root Directory is set to `apps/dashboard` in the Vercel dashboard.
