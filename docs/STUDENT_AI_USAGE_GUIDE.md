# Student guide: AI Usage tab

This guide walks you through the **AI Usage** tab on the ts-repo-metrics dashboard. Use it to see how you work with your coding agent (Cursor, Claude Code, Codex, or Gemini)—not as a grade, but as a mirror for your habits.

**What you will do:**

1. Sign in with GitHub
2. Analyze your project repository
3. Open the **AI Usage** tab
4. Copy the platform prompt and run it in your coding-agent project
5. Upload the generated CSV
6. Read your metrics

For technical details (CSV columns, manual export commands, persistence), see [AI_USAGE_LOGS.md](./AI_USAGE_LOGS.md).

---

## Before you start

You need:

- A **GitHub account** with access to the repository you want to analyze
- A **coding agent** you have actually used on that project (Cursor, Claude Code, Codex, or Gemini)
- **Python 3** on your machine (the copied prompt uses it to run the export script)

The AI Usage tab only works **after** you have run a repository analysis and are viewing the results page.

---

## Step 1: Sign in with GitHub

1. Open the dashboard (your instructor’s course link, or the hosted app home page).
2. Click **Sign in with GitHub**.
3. Approve the GitHub permissions when prompted.

You must be signed in to analyze a repository and to save your AI usage CSV. If you are not signed in, you will see **“Sign in required”** when you try to analyze.

### Course submissions

If your instructor gave you a **course analyze link** (for example `/course/CSE115A-Summer26/analyze`):

1. Click **Get started**
2. Enter your **team name** (for example `Team Rocket`)
3. Click **Continue**
4. Sign in with GitHub
5. Pick your team’s repository from the list

The results page may show a research notice: *“This analysis is not used to grade individual students.”*

---

## Step 2: Analyze your repository

### From the home page

1. Paste your GitHub repository URL into the input field.
2. Click **Go** (the button shows **Analyzing…** while the scan runs).
3. When analysis finishes, you are taken to your **results page** (`/r/...`).

**Tip:** You can click **Try sample repo** to explore the dashboard with a demo repository first.

### From My Repos

1. After signing in, click **Or open My Repos**.
2. Find your repository in the list.
3. Click **Click to analyze**.

Wait until you see **Analysis complete**. The results page has several tabs across the top (Commit Habits, Testing, Code Quality, and others).

---

## Step 3: Open the AI Usage tab

On the results page:

1. Find the tab labeled **AI Usage** (between **Code Complexity** and **Documentation**).
2. Click it.

You will see:

- A short intro: *“Use it as a mirror for habits, not a grade.”*
- Four platform choices: **Claude Code**, **Codex**, **Gemini**, and **Cursor**
- An upload area for your CSV (empty until you complete the steps below)

There is **no demo data** on this tab—you need to generate and upload your own trace file.

---

## Step 4: Copy the prompt and run it in your project

This is the most important step. The dashboard gives you a ready-made prompt so your coding agent can export your session logs.

### 4a. Pick your platform

Click the sub-tab for the agent you use:

| If you use… | Click |
|-------------|-------|
| Cursor | **Cursor** |
| Claude Code | **Claude Code** |
| OpenAI Codex | **Codex** |
| Google Gemini | **Gemini** |

### 4b. Copy the prompt

1. Read the instructions under your platform tab.
2. Click **Copy Cursor prompt** (or **Copy Claude prompt**, **Copy Codex prompt**, **Copy Gemini prompt**).
3. You should see confirmation: *“{Platform} prompt copied”*.

### 4c. Run the prompt in the **same project** you analyzed

1. Open your coding agent **in the repository you just analyzed** (the same repo URL you submitted).
2. Paste the copied prompt into a new chat.
3. Let the agent run. It will:
   - Infer the correct `--filter` for your repo (or ask you if unclear)
   - Clone or update the [agent_stats](https://github.com/scottyUX/agent_stats) tool on your Desktop
   - Run the export with `--messages` and `--tokens`
   - Save **`ai_usage_trace.csv`** to your **Desktop**

4. When the agent finishes, confirm you have a file at:
   - **Mac / Linux:** `~/Desktop/ai_usage_trace.csv`
   - **Windows:** `%USERPROFILE%\Desktop\ai_usage_trace.csv`

**Important:**

- Run the prompt **inside the same coding-agent project** as the analyzed repo so the `--filter` matches your work.
- The agent may ask for permission to run shell or network commands—approve once so it can finish.
- The prompt does **not** modify your project files; it only exports logs.

If something fails, you can open [agent_stats on GitHub](https://github.com/scottyUX/agent_stats) and run the export manually. See [AI_USAGE_LOGS.md](./AI_USAGE_LOGS.md) for platform-specific commands.

---

## Step 5: Upload your CSV

Back on the **AI Usage** tab in the dashboard:

1. Find the upload area labeled **Upload `ai_usage_trace.csv`**.
2. Either:
   - **Drag and drop** `ai_usage_trace.csv` from your Desktop, or
   - **Click** the upload area and choose the file.

What happens next:

1. Your browser parses the CSV **locally** (your file is not sent to a third-party analytics service for display).
2. Metrics appear on the tab immediately.
3. The raw CSV is **saved on your analysis** so it reloads the next time you open this results page.

Status messages you might see:

| Message | Meaning |
|---------|---------|
| *Looking for a previously uploaded CSV…* | Checking if you already uploaded one for this analysis |
| *Saving ai_usage_trace.csv on this analysis…* | Upload in progress |
| *ai_usage_trace.csv saved for this analysis.* | Success—your data is stored |
| *Saved AI Usage CSV loaded for this analysis.* | You returned to a results page that already had a CSV |

If you see warnings about missing columns, re-run the export with `--messages` and `--tokens` (the copied prompt includes both).

---

## Step 6: Read your data

After upload, the tab shows six sections. Each metric card has a **?** button—click it for what the number means, why it matters, and how to improve.

Read them in this order:

### Token efficiency

How much context and output your agent sessions used.

- **Input tokens** — total prompt/context sent to the model
- **Output tokens** — total text the model generated
- **Cache hit rate** — how often cached context was reused (higher can mean more efficient repeats)
- **Tokens per prompt** — average tokens per user prompt

*Requires the export to include token columns (`--tokens`).*

### Prompt quality

How detailed your prompts tend to be.

- **Average prompt length** — characters in captured prompts
- **Detailed prompt rate** — share of prompts at least 200 characters
- **Short prompt rate** — share of prompts under 50 characters
- **Prompt capture rate** — share of prompts where message text was recorded

*Requires the export to include message text (`--messages`).*

### Activity snapshot

A **40-day heatmap** (like GitHub’s contribution graph) showing days you used the agent.

- Darker cells = more prompts that day
- Summary: active days, prompts per day, busiest day
- **Total prompts** and **Total tool calls** cards

### Workflow pattern

How your agent time splits between reading, writing, and verifying.

- **Exploration** — read, search, grep, glob, etc.
- **Generation** — write, edit, apply patches
- **Verification / execution** — run terminal commands, tests, tasks

Also includes a **workflow diagnostic** (for example “Balanced workflow” or “Low verification”) and a **raw tool breakdown** by category.

### Session behavior

How you structure agent conversations.

- **Sessions** — number of distinct sessions
- **Average prompts per session**
- **Average tool calls per session**
- **Tool calls per prompt**

### Review habits

Whether you read code back after the agent writes.

- **Write ratio** — writes vs reads
- **Read-after-write rate** — how often you read shortly after a write
- **Global verification ratio** — verification-style tools vs all tool calls

---

## Quick checklist

Use this before you tell your instructor you are done:

- [ ] Signed in with GitHub
- [ ] Repository analyzed; on the results page
- [ ] **AI Usage** tab open
- [ ] Correct platform selected (Cursor / Claude Code / Codex / Gemini)
- [ ] Prompt copied and run **in the same repo** you analyzed
- [ ] `ai_usage_trace.csv` on your Desktop
- [ ] CSV uploaded on the AI Usage tab
- [ ] Metrics visible (no empty-state message)
- [ ] Clicked **?** on at least one metric you want to discuss or improve

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| **Sign in required** | Sign in with GitHub before analyzing or uploading |
| **Tab is empty after upload** | Make sure the file is named `ai_usage_trace.csv` and is valid CSV from `agent_stats` |
| **Token metrics show “—”** | Re-export with `--tokens` (the copied prompt already includes this) |
| **Prompt quality metrics missing** | Re-export with `--messages` |
| **Agent could not find logs** | Confirm you used that platform on this repo; log paths differ by OS (see [AI_USAGE_LOGS.md](./AI_USAGE_LOGS.md)) |
| **Wrong repo in the trace** | Re-run the prompt in the **same** project you analyzed; check the `--filter` value |
| **CSV saved but metrics look wrong** | Upload again after a fresh export; old sessions from other repos may be included if `--filter` was wrong |

---

## Privacy and research notes

- Your CSV is tied to your **analysis record** (`result_id`), not posted publicly.
- Course analyses may include `course_id` and `team_name` for research joins.
- The tab is designed for **self-reflection**—use the **?** help text to interpret numbers and set your own improvement goals.

---

## Related docs

- [AI_USAGE_LOGS.md](./AI_USAGE_LOGS.md) — CSV format, manual export commands, persistence API
- [DOC_REVIEW_AGENT.md](./DOC_REVIEW_AGENT.md) — **Documentation** tab (separate from AI Usage)
