# Branching and deployment

Railway is the primary host. Vercel is archived — do not use it for new deploys.

## Branches

| Branch | Purpose | Deploy target |
|--------|---------|---------------|
| `feature/*` | Student/instructor work | — |
| `dev` | Integration / staging | Railway **development** |
| `main` | Production releases | Railway **production** |

## URLs

| Environment | URL |
|-------------|-----|
| **Staging (dev)** | https://ts-repo-metrics-development.up.railway.app |
| **Production** | https://ts-repo-metrics-production.up.railway.app |
| **Local** | http://localhost:3000 |

## Workflow

1. Branch from **`dev`**: `git checkout dev && git pull && git checkout -b feature/your-task`
2. Open a PR targeting **`dev`** (not `main`).
3. Get **one approving review**, ensure CI is green, then merge.
4. Staging auto-deploys from **`dev`** — smoke-test on the development URL.
5. Production updates only when the instructor merges **`dev` → `main`**.

After a hotfix on `main`, back-merge **`main` → `dev`** so branches stay aligned.

## Local development

- Copy [`apps/dashboard/.env.example`](../apps/dashboard/.env.example) to `apps/dashboard/.env.local`.
- Do **not** set `APP_ORIGIN` or `NEXT_PUBLIC_APP_URL` to a Railway URL locally.
- OAuth callback stays on `http://localhost:3000/auth/callback`.

## Shared Supabase database

Staging and production Railway both use the **same** Supabase project. Rows written on staging appear in production data. Treat staging as a UI/integration environment, not an isolated dataset.

## Branch protection

- **`dev`**: PR required, 1 approving review, CI required (`test` job).
- **`main`**: PR required, instructor merge only.

See also [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`RAILWAY_DEPLOY.md`](../RAILWAY_DEPLOY.md).

Instructor-only dashboard steps (Supabase redirect URL, Vercel disconnect, CI push): [`scripts/SETUP_DEV_ENV.md`](../scripts/SETUP_DEV_ENV.md).
