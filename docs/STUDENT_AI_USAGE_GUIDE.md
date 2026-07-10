# Student guide: AI Usage tab

This guide walks you through the **AI Usage** tab on the ts-repo-metrics dashboard. Use it to see how you work with your coding agent—not as a grade, but as a mirror for your habits.

There is a **dedicated assignment on Canvas** where you will submit your reflection. Complete the steps below first, then go to Canvas to submit.

**What you will do:**

1. Sign in with GitHub
2. Analyze your course project repository
3. Open the **AI Usage** tab
4. Copy the platform prompt and run it **inside your course project**
5. Upload the generated CSV
6. Read your metrics and write your reflection
7. Submit to Canvas

For technical details (CSV columns, manual export commands, persistence), see [AI_USAGE_LOGS.md](./AI_USAGE_LOGS.md).

---

## Before you start

You need:

- A **GitHub account** with access to the repository you want to analyze
- A **coding agent desktop application** you have actually used on that project — Claude Code (desktop app), Codex CLI, or Gemini CLI. The coding agent **must be a desktop application**, not a browser-based tool.
- **Python 3** on your machine (the copied prompt uses it to run the export script)

> **Note for Cursor users:** Token usage metrics (input/output tokens, cache hit rate) are not currently working for Cursor. You can still upload a trace file and see activity and workflow metrics, but token efficiency data will be unavailable.

The AI Usage tab only works **after** you have run a repository analysis and are viewing the results page.

---

## Step 1: Sign in with GitHub

### Course link (required for CSE 115A)

Your instructor will give you a **course analyze link** such as:

```
/course/CSE115A-Summer26/analyze
```

Using this link creates a folder in the research database for **Summer CSE 115a**, grouping your team's submission with the rest of the cohort. Always use the course link—do not analyze from the general home page.

1. Click the course link your instructor provided.
2. Click **Get started**.
3. Enter your **team name** (for example `Team Rocket`).
4. Click **Continue**.
5. Sign in with GitHub and approve the permissions when prompted.
6. Pick your team's repository from the list.

The results page may show a research notice: *"This analysis is not used to grade individual students."*

---

## Step 2: Analyze your repository

After signing in through the course link:

1. Click **Or open My Repos**.
2. Find your team's course project repository in the list.
3. Click **Click to analyze**.

Wait until you see **Analysis complete**. The results page has several tabs across the top (Commit Habits, Testing, Code Quality, and others).

---

## Step 3: Open the AI Usage tab

On the results page:

1. Find the tab labeled **AI Usage** (between **Code Complexity** and **Documentation**).
2. Click it.

You will see:

- A short intro endind in *"Use it as a mirror for habits, not a grade."*
- Platform choices: **Claude Code**, **Codex**, **Gemini**, and **Cursor**
- An upload area for your CSV (empty until you complete the steps below)

There is **no demo data** on this tab—you need to generate and upload your own trace file.

---

## Step 4: Copy the prompt and run it in your course project

This is the most important step. The dashboard gives you a ready-made prompt so your coding agent can export your session logs.

**Important:** You must open your coding agent **inside the same repository you just analyzed**—your course project. Running the prompt outside the project will export the wrong session data.

1. Click the sub-tab for the agent you use (Claude Code, Codex, Gemini, or Cursor).
2. Click the **Copy prompt** button (for example **Copy Claude prompt**).
3. Open your coding agent **desktop application** with your course project open.
4. Paste the copied prompt into a new chat.
5. Let the agent run. It will:
   - Infer the correct `--filter` for your repo (or ask you if unclear)
   - Clone or update the [agent_stats](https://github.com/scottyUX/agent_stats) tool
   - Run the export with `--messages` and `--tokens`
   - Save **`ai_usage_trace.csv`** to your **Desktop**

6. When the agent finishes, confirm you have a file at:
   - **Mac / Linux:** `~/Desktop/ai_usage_trace.csv`
   - **Windows:** `%USERPROFILE%\Desktop\ai_usage_trace.csv`

**Important:**

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

If you see warnings about missing columns, re-run the export with `--messages` and `--tokens` (the copied prompt includes both).

---

## Step 6: Read your data and write your reflection

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

A **40-day heatmap** (like GitHub's contribution graph) showing days you used the agent.

- Darker cells = more prompts that day
- Summary: active days, prompts per day, busiest day
- **Total prompts** and **Total tool calls** cards

### Workflow pattern

How your agent time splits between reading, writing, and verifying.

- **Exploration** — read, search, grep, glob, etc.
- **Generation** — write, edit, apply patches
- **Verification / execution** — run terminal commands, tests, tasks

Also includes a **workflow diagnostic** (for example "Balanced workflow" or "Low verification") and a **raw tool breakdown** by category.

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

## Writing your reflection

Your Canvas assignment asks you to write **1–2 paragraphs** about your metrics. For each of the three tabs below, write **3 sentences** covering: (1) whether you understood the metric and what it showed about your work, (2) how you would change your coding-agent behavior based on what you saw, and (3) what additional metrics you think would give a more complete picture.

---

## Step 7: Submit to Canvas

Once your metrics are visible and you have written your reflection:

1. Open the **dedicated AI Usage assignment** on Canvas.
2. Paste or type your reflection paragraphs directly into the submission text box.
3. Include a **screenshot** of your AI Usage tab showing your metrics (the activity heatmap and at least one other section).
4. Submit.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| **Sign in required** | Sign in with GitHub before analyzing or uploading |
| **Tab is empty after upload** | Make sure the file is named `ai_usage_trace.csv` and is valid CSV from `agent_stats` |
| **Token metrics show "—"** | Re-export with `--tokens` (the copied prompt already includes this); Cursor token data is not yet supported |
| **Prompt quality metrics missing** | Re-export with `--messages` |
| **Agent could not find logs** | Confirm you used that platform on this repo; log paths differ by OS (see [AI_USAGE_LOGS.md](./AI_USAGE_LOGS.md)) |
| **Wrong repo in the trace** | Re-run the prompt **inside** the course project you analyzed; check the `--filter` value |
| **CSV saved but metrics look wrong** | Upload again after a fresh export; old sessions from other repos may be included if `--filter` was wrong |

---

## Privacy

- **Your student identifier is never stored in plain text.** The `agent_stats` script hashes it with SHA-256 to create a stable pseudonym. Researchers can identify your submissions across analyses without ever seeing your email.
- **Filtering keeps your data scoped.** The `--filter` flag (set automatically by the copied prompt) limits the export to sessions that touched your course project directory, so sessions from other projects are not included.
- **Local parsing.** Your CSV is parsed in your browser. The file contents are only sent to the server to be stored on your own analysis record (`result_id`), not to any third-party analytics service.
- **Course analyses** include `course_id` and `team_name` for research joins, but individual student work is not publicly visible.
- The tab is designed for **self-reflection**—use the **?** help text to interpret numbers and set your own improvement goals.

---

## Related docs

- [AI_USAGE_LOGS.md](./AI_USAGE_LOGS.md) — CSV format, manual export commands, persistence API
- [DOC_REVIEW_AGENT.md](./DOC_REVIEW_AGENT.md) — **Documentation** tab (separate from AI Usage)
