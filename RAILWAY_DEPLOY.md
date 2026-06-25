# Deploying the dashboard to Railway

The app is a **Docker** deployment from the **repository root** (see [`Dockerfile`](Dockerfile)). The runner image includes **`git`** so [`analyzeFromGitHubUrl`](packages/engine/src/pipeline/analyzeFromGitHubUrl.ts) can **clone** repos instead of falling back to the zipball + GitHub API path (restoring `gitMetricsV2` and accurate commit line metrics).

For Vercel-specific notes and env semantics, see [`apps/dashboard/VERCEL_DEPLOY.md`](apps/dashboard/VERCEL_DEPLOY.md) (optional cross-reference during migration).

## Build layout

- **Platform:** `linux/amd64` (matches typical Railway nodes; avoids wrong tree-sitter binaries when building on Apple Silicon).
- **Next.js:** `output: "standalone"` with `outputFileTracingRoot` at the monorepo root — see [`apps/dashboard/next.config.ts`](apps/dashboard/next.config.ts).
- **Engine:** built once in the image (`npm run build --prefix packages/engine`); dashboard uses `npx next build` only (no second engine compile).

## Health check

Configure Railway’s HTTP health check to:

- **Path:** `/api/health`
- **Method:** GET  
  Returns `200` and JSON `{ "ok": true }`.

## Environment variables

Set these on the **Railway service → Variables** (same semantics as production on Vercel):

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public; inlined at build — required for browser bundle) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public; build + browser) |
| `SUPABASE_URL` | **Optional on Railway:** same as project URL; **Node/server runtime** so APIs work even if `NEXT_PUBLIC_*` was empty at image build |
| `SUPABASE_ANON_KEY` | **Optional:** same as anon key; server/middleware runtime fallback |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — server only (runtime) |
| `GITHUB_OAUTH_ENCRYPTION_KEY` | Secret for encrypting stored GitHub OAuth tokens |
| `GITHUB_TOKEN` | Optional — higher GitHub API limits for guests / zipball fallback |
| `OPENAI_API_KEY` | Optional — required for coach/chat routes that call OpenAI |
| `APP_ORIGIN` | **Recommended:** `https://<your-service>.up.railway.app` (no trailing slash). Ensures `/auth/callback` redirects use the public URL, not `http://0.0.0.0:8080` behind the proxy. |

### Build time vs runtime (important)

Railway only passes variables into the Docker **build** if they are declared as `ARG` in the [`Dockerfile`](Dockerfile). This repo declares `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before `next build` so the browser bundle gets the Supabase client config.

- Add or change **`NEXT_PUBLIC_*`** in Railway, then **redeploy** so a new image build runs. Runtime-only env changes are not enough for client-side Supabase.

See [Railway: Using variables at build time](https://docs.railway.com/guides/dockerfiles#using-variables-at-build-time).

## Supabase Auth (GitHub)

1. After the first deploy, open your app’s **HTTPS** origin from Railway (e.g. `https://something.up.railway.app` — use **Settings → Networking → Generate domain** if needed).
2. **Authentication → URL configuration**
   - **Site URL:** set to that origin **with trailing slash** if you use it elsewhere consistently (e.g. `https://something.up.railway.app/`).
   - **Redirect URLs:** add **`https://<your-host>/auth/callback`**. Keep your existing **`http://localhost:*`** entries if you still develop locally; production and local can share one Supabase project.
3. **GitHub OAuth App:** callback remains Supabase’s `https://<project-ref>.supabase.co/auth/v1/callback` (unchanged).

See [`apps/dashboard/VERCEL_DEPLOY.md`](apps/dashboard/VERCEL_DEPLOY.md) for the full OAuth checklist (legacy Vercel notes).

## Environments (dev + production)

| Railway environment | Git branch | Public URL |
|---------------------|------------|------------|
| **production** | `main` | https://ts-repo-metrics-production.up.railway.app |
| **development** | `dev` | https://ts-repo-metrics-development.up.railway.app |

Both services share one Supabase project. Set **`APP_ORIGIN`** per environment (no trailing slash):

- Production: `https://ts-repo-metrics-production.up.railway.app`
- Development: `https://ts-repo-metrics-development.up.railway.app`

All other secrets (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_OAUTH_ENCRYPTION_KEY`, etc.) are the same values in both environments.

**Supabase redirect URLs** must include both:

- `https://ts-repo-metrics-production.up.railway.app/auth/callback`
- `https://ts-repo-metrics-development.up.railway.app/auth/callback`

Keep **Site URL** on the production Railway origin. See [`docs/BRANCHING.md`](docs/BRANCHING.md) for the student PR workflow.

## Railway service setup (checklist)

1. In [Railway](https://railway.app), create or open a **project**, then **New → GitHub Repo** and select this repository (or push your branch and connect the repo).
2. Railway should detect the root **`Dockerfile`**. If not, set service variable **`RAILWAY_DOCKERFILE_PATH`** to `Dockerfile` (repo root).
3. In **Variables**, add every row from the table above **before** or with the first deploy (especially `NEXT_PUBLIC_*` so the build bakes them in).
4. Under **Settings → Deploy → Healthcheck**, set path **`/api/health`**, method **GET**.
5. Increase **timeouts** / **instance size** if **`POST /api/analyze`** fails on larger repos (clone + analysis is heavy).
6. **Smoke test:** run Analyze on a public repo; confirm **`gitMetricsV2`** exists and Commit Habits “Additional Signals” look populated. Test **Sign in with GitHub** on the **Railway URL** after updating Supabase redirect URLs.
7. **Auto-redeploy:** pushes to the tracked branch should trigger a new Railway deployment when GitHub auto-deploy is enabled for the service.

## Ephemeral clone cache

[`apps/dashboard/app/api/analyze/route.ts`](apps/dashboard/app/api/analyze/route.ts) stores git clones under `os.tmpdir()` (e.g. `/tmp/...`). **Each new deploy** resets container disk, so the **clone cache is cold** after redeploy (same class of behavior as serverless). Optional later: mount a Railway volume and pass a stable `cacheDir` into `analyzeFromGitHubUrl` (code change).

## DNS cutover (checklist)

1. Attach your **custom domain** in Railway and wait for TLS to succeed.
2. Update **Supabase** Site URL / redirect URLs if you change the public origin.
3. When stable, **disable or remove** the Vercel project (or keep it only for previews).

## Local Docker (optional)

```bash
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t repo-metrics-dashboard .
docker run --rm -p 3000:3000 -e NODE_ENV=production \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e GITHUB_OAUTH_ENCRYPTION_KEY=... \
  repo-metrics-dashboard
```

Use `-p 3000:${PORT:-3000}` if you set a different `PORT`. Pass the same server-side secrets as in the Railway Variables table.

Requires Docker Desktop (or equivalent) running.
