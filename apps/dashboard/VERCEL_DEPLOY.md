# Deploying the Dashboard to Vercel

> **Legacy / archived.** Production and staging run on **Railway** — see [RAILWAY_DEPLOY.md](../../RAILWAY_DEPLOY.md) and [docs/BRANCHING.md](../../docs/BRANCHING.md). The Vercel Git integration is disconnected from `main`; do not deploy here unless intentionally reviving this path.

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

## Environment variables

**Without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the header shows “Sign in unavailable” and `/repos` returns “Authentication is not configured.”** These are inlined at **build time** — after adding or changing them in Vercel, trigger a new deployment.

- **`NEXT_PUBLIC_SUPABASE_URL`**: Supabase project URL.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**: Supabase **anon** (public) key. Required for cookie-based sessions and for **RLS-protected reads** of `analyses` (`GET /api/results/...`, server-side `getReportById`).
- **`SUPABASE_SERVICE_ROLE_KEY`**: Service role key — **server-only**. Used for trusted upserts from `POST /api/analyze` and for persisting encrypted GitHub tokens after OAuth callback.
- **`GITHUB_OAUTH_ENCRYPTION_KEY`**: Secret string used to derive an AES-256-GCM key for encrypting GitHub OAuth access tokens in `user_github_tokens`. Required for “Sign in with GitHub” private-repo access.
- **`GITHUB_TOKEN`** (optional): When no user session token is present and the git binary is unavailable (Vercel zipball path), unauthenticated or this env token is used for GitHub API/zipball. Raises rate limits for **guest** runs. Signed-in users use the token stored from GitHub OAuth.

## Supabase CLI: push migrations to the hosted project

From the **repository root** (not `apps/dashboard`):

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) (e.g. `brew install supabase/tap/supabase`).
2. Authenticate (one-time): `supabase login` — or set `SUPABASE_ACCESS_TOKEN` for CI.
3. Link this repo to your project:  
   `supabase link --project-ref <your-project-ref> --yes`  
   If prompted, pass the database password with `-p` / `--password` (the password you chose when creating the Supabase project).
4. Apply migrations: `supabase db push`

Migrations live under [`supabase/migrations/`](../../supabase/migrations): baseline [`20260221110000_create_analyses.sql`](../../supabase/migrations/20260221110000_create_analyses.sql) then auth/RLS [`20260221120000_github_auth_analyses_rls.sql`](../../supabase/migrations/20260221120000_github_auth_analyses_rls.sql). [`supabase/config.toml`](../../supabase/config.toml) is created by `supabase init`.

## Supabase Auth (GitHub) and database (dashboard checklist)

1. **Authentication → URL configuration:** set **Site URL** (e.g. `http://localhost:3000` for dev, production URL for prod). Under **Redirect URLs**, add `http://localhost:3000/auth/callback` and your production `https://…/auth/callback`.
2. **Authentication → Providers → GitHub:** enable GitHub; paste OAuth App **Client ID** and **Client secret**.
3. **GitHub OAuth App** (GitHub → Settings → Developer settings): **Authorization callback URL** must be Supabase’s `https://<project-ref>.supabase.co/auth/v1/callback` (shown next to the GitHub provider in Supabase).
4. **Settings → API:** copy project URL, **anon** / publishable key, and **service_role** into `apps/dashboard/.env.local` (see [`.env.example`](./.env.example)). Generate a random `GITHUB_OAUTH_ENCRYPTION_KEY` for token encryption at rest.

After `supabase db push`, confirm in the SQL Editor: tables `analyses` and `user_github_tokens`; RLS on `analyses` with policy `analyses_select_public_or_own`.

**Behavior:** Guests analyze **public** repos without login. Signed-in users get `repo`-scoped GitHub tokens stored (encrypted); `analyzeFromGitHubUrl` receives `githubToken` and can clone or download zipballs for **private** repos. Clone cache for authenticated runs is under `os.tmpdir()/repo-metrics-git-cache/u/<userId>/`.

## Deploy from repo root

```bash
cd /path/to/repo-metrics
npx vercel --prod
```

Ensure the project is linked to the repo (e.g. `.vercel/project.json` in repo root) and Root Directory is set to `apps/dashboard` in the Vercel dashboard.
