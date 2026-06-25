# Dev environment — manual steps (instructor)

Automated setup completed everything except these dashboard-only steps (login required).

## 1. Supabase redirect URL (required for dev OAuth)

1. Open [Auth URL configuration](https://supabase.com/dashboard/project/walwexxczaibfojinkfi/auth/url-configuration)
2. Keep **Site URL**: `https://ts-repo-metrics-production.up.railway.app/`
3. Under **Redirect URLs**, add if missing:
   - `https://ts-repo-metrics-development.up.railway.app/auth/callback`
   - `https://ts-repo-metrics-production.up.railway.app/auth/callback`
   - `http://localhost:3000/auth/callback` (and 3001/3002 if used)
4. Save

## 2. Disconnect Vercel from `main`

1. Open [Vercel project Git settings](https://vercel.com/scottyuxs-projects/repo-metrics-dashboard/settings/git)
2. **Disconnect** the GitHub repository, or disable production auto-deploy for `main`
3. Optionally **Archive** the project

## 3. Push CI workflow (GitHub `workflow` scope)

The CI file is committed locally but could not be pushed without the `workflow` OAuth scope:

```bash
gh auth refresh -h github.com -s workflow
cd /path/to/ts-repo-metrics
git checkout dev
git push origin dev   # pushes .github/workflows/ci.yml if still local-only
```

If the workflow commit was dropped, restore from local branch or recreate from [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

After the first green CI run, enable required status check on `dev`:

```bash
gh api --method PUT repos/scottyUX/ts-repo-metrics/branches/dev/protection --input - <<'EOF'
{
  "required_status_checks": { "strict": false, "contexts": ["test"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

Note: the check context name may be `CI / test` — verify under **Actions** after the first run and adjust `contexts` if needed.

## 4. Database backup location

Pre-dev-env backup (not in git):

- `backups/supabase-pre-dev-env-20260225.json` — full `analyses` + `user_github_tokens` export
- `backups/analyses-20260225.csv` — tabular analyses snapshot

121 analyses, 56 tokens at export time.
