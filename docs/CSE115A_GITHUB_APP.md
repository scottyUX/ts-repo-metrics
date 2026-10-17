# Course GitHub App: setup

The course site reads each team's repository through a GitHub App instead of a GitHub OAuth app.

| | OAuth app | GitHub App |
| --- | --- | --- |
| What a student approves | Read and write access to every repository they can reach (`repo` scope) | Their GitHub username |
| Repositories the site can read | All of the student's repositories | Only repositories a team installed the app on |
| Access | Read and write | Read-only: contents, pull requests, checks, commit statuses |
| Tokens stored | Each student's GitHub token, encrypted | None; the server asks GitHub for a one-hour token when it needs one |

How it works (`apps/dashboard/lib/cse115a/githubApp.ts`):

1. **Connect GitHub** on the dashboard now only proves the student's GitHub username. Supabase's GitHub provider uses the app's OAuth credentials.
2. One member of each team installs the app on the team repository.
3. When a student adds a pull request, submits a sprint, opens a PR's commits, or runs a course analysis, the server:
   - looks up the app's installation on that repository (`GET /repos/{owner}/{repo}/installation`);
   - checks the student's linked account has **write** access (`GET /repos/{owner}/{repo}/collaborators/{login}/permission` returns `admin` or `write`);
   - reads the repository with an installation token scoped to that one repository.

Two details behind the access check:

- **Why write access:** on a public repository, everyone has read access, so read access doesn't tell team members apart. Every team member needs write access anyway, to push task branches.
- **Why not the plain collaborator check:** with an installation token, `GET /repos/{owner}/{repo}/collaborators/{login}` only counts people added to the repository directly. It returns 404 for organization owners and team members, which is why the code asks for the permission instead.

When a check fails, the student sees an error with a code they can act on:

| Code | Shown when |
| --- | --- |
| `github_not_linked` | The student hasn't connected GitHub. |
| `github_app_not_installed` | The app isn't installed on that repository; the message includes the install link. |
| `github_not_collaborator` | The student's GitHub account can't push to that repository. |
| `github_app_unconfigured` | The `GITHUB_APP_*` settings are missing on the server. |

## 1. Create the GitHub App

Under the organization that will own it: **Settings → Developer settings → GitHub Apps → New GitHub App**.

- **Callback URL:** your Supabase callback, `https://<project-ref>.supabase.co/auth/v1/callback`.
- **Expire user authorization tokens:** leave on. The site doesn't keep user tokens.
- **Request user authorization (OAuth) during installation:** off. **Device flow:** off.
- **Setup URL** (optional): the dashboard URL, with **Redirect on update** checked, so students return there after installing.
- **Webhook:** off.
- **Repository permissions,** all read-only: **Contents**, **Pull requests**, **Checks**, **Commit statuses**. **Metadata** read-only is required by GitHub.
- **Account permissions:** **Email addresses**, read-only. Without it, Supabase can't read the GitHub account's email, and linking fails with "Error getting user email from external provider".
- **Where can this GitHub App be installed?** **Any account**, because team repositories belong to students' accounts and organizations.

After creating it, note the **App ID** and **Client ID**, generate a **client secret**, and generate a **private key** (`.pem`).

## 2. Point Supabase's GitHub provider at the app

In Supabase, go to **Authentication → Sign In / Providers → GitHub** and replace the client ID and secret with the app's. Keep **Allow manual linking** on, because students link GitHub to the account they signed in with.

Students who linked GitHub through the old OAuth app stay linked. GitHub identifies them by the same user, so they don't need to connect again.

## 3. Server settings

Set these on the web app (the grading worker doesn't read GitHub):

| Variable | Value |
| --- | --- |
| `GITHUB_APP_ID` | the App ID |
| `GITHUB_APP_SLUG` | the app's slug, from `github.com/apps/<slug>`; used for the install link |
| `GITHUB_APP_PRIVATE_KEY` | the private key, as a secret: the PEM, the PEM with `\n` escapes, or base64 of the PEM |

Base64 is the easiest to paste into hosts that take single-line values:

```bash
base64 -w0 your-app.private-key.pem   # macOS: base64 -i your-app.private-key.pem
```

The auth callback stops storing GitHub user tokens when `CSE115A_SITE=true`, because the course site no longer uses them. On a deployment without `CSE115A_SITE=true`, the main Repo Metrics pages keep storing and using user tokens as before. Rows already in `user_github_tokens` can be deleted once the OAuth app is retired.

**Check:** after signing in, each pull request field on the dashboard shows an **Install or check it** link. If it's missing, `GITHUB_APP_SLUG` isn't set.

## 4. Students install the app (once per team)

One team member who manages the repository opens `https://github.com/apps/<slug>/installations/new`, picks the account that owns the team repository, chooses **Only select repositories**, selects it, and clicks **Install**.

- **Organization repositories:** a student who isn't an owner sees **Request** instead of **Install**. An organization owner approves it under the organization's **Settings → GitHub Apps**.
- **Write access:** every student who submits needs write access to the team repository, through a collaborator invite or an organization team.
- **Forks:** pull requests must come from the team repository that has the app installed. The app can't read forks it isn't installed on.
