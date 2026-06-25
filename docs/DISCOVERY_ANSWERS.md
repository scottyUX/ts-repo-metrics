# Discovery Q&A — UCSC Developer Analytics Tool (Student MVP)

_UCSC Developer Analytics Tool · April 2026_

---

## 1. Product Vision & Goals

**Q: What problem does this tool solve? What is painful or missing right now?**

A: Students build software projects but receive little structured feedback on _how_ they develop across the SDLC. Poor practices (e.g., infrequent commits, lack of testing, high complexity, AI-related issues) go unnoticed. While raw data is already collected for research, it is not translated into actionable feedback for students. This tool solves that by turning repository data into clear guidance for improving development practices.

---

**Q: What does success look like at the end of this quarter?**

A: Students can analyze their repo and receive clear, easy-to-understand, actionable feedback on project health. They can identify where they are weak and understand how to improve in each SDLC stage.

---

**Q: Is this tool for internal research use only, or will it be published or shared?**

A: It will be shared with students. This is a student-facing tool for learning and improvement.

---

**Q: What is the ONE most important thing this product must do well?**

A: Show students exactly where they are weakest in the SDLC and tell them what to do next.

---

**Q: Is there anything else about product vision and goals?**

A: The tool should act as a coach, not just a dashboard. It must prioritize clarity and actionability over raw data.

---

## 2. Users

**Q: Who logs into this tool — researchers only, or students too?**

A: Students only (MVP).

---

**Q: When a researcher logs in, do they see ALL students or only their own class?**

A: Not applicable for MVP (no researcher role yet).

---

**Q: How many researchers will use this? How many students total?**

A: Primarily student usage. Exact numbers depend on enrolled classes.

---

**Q: Will researchers use this daily or only at checkpoints?**

A: Not applicable for MVP.

---

**Q: What do researchers need to see and do in this tool?**

A: Not applicable for MVP.

---

**Q: What do students need? Should they see their own data, and if so what would be useful?**

A: Students should only see their own repo data. Useful information includes:

- Progress trends
- Collaboration balance
- Documentation/testing signals
- Project hygiene indicators
- Clear recommendations for improvement

---

**Q: Anything else about users?**

A: No differentiation between course levels is required for MVP. Design should support a range of skill levels.

---

## 3. Data & Metrics

The tool measures five SDLC phases, all derived from the GitHub repo at analysis time:

| Tab | Phase | Key metrics |
|-----|-------|-------------|
| **Behavioral** | Git workflow | Commit frequency, median/p90 commit size, burst ratio, large-commit %, refactor commit ratio, time-entropy |
| **Verification** | Test coverage proxy | Test-to-feature commit ratio, % commits touching tests, test file LOC vs source LOC |
| **Quality** | Code quality | Cyclomatic complexity (avg/max), cognitive complexity, maintainability index (GradAI norm), duplication %, code smells (long functions, deep nesting, long param lists, empty catches, console logs) |
| **React & TSX** | Component health | JSX depth, hook count/SLOC, prop-drilling edges, hook safety flags, monolithic component detection |
| **AI Smells** | Pathology | Silent failure density (SFD), monolithic component ratio (MCR), suspicious refactor similarity score (SRS) |

- Metrics are expressed as **scores/percentages with colour-coded thresholds** (green/yellow/red traffic-light system already in the UI).
- Data updates **on demand** — each analysis run is triggered by the student pasting a URL or clicking a repo card. There is no scheduled/commit-hook trigger yet.
- The data backend (Supabase + engine) **is built**. The `analyses` table stores the full `report_json` keyed by `owner-repo-commitSha`.

---

**Q: How is each metric expressed?**

A: Scores and percentages with color-coded indicators (green/yellow/red), along with interpreted summaries.

---

**Q: How frequently does data update?**

A: On-demand when a student runs analysis. Each run corresponds to a specific commit SHA.

---

**Q: Is the data backend already built?**

A: Yes. Backend uses Supabase and stores full report JSON per analysis.

---

**Q: What does a researcher actually do after seeing the data?**

A: Not applicable for MVP.

---

**Q: Anything else about data and metrics?**

A: Metrics must be translated into actionable insights. Raw values alone are insufficient for student use.

---

## 4. Screens & Scope

**Q: Individual view vs team view?**

A: Individual only for MVP.

---

**Q: Can a researcher compare the same student across levels over time?**

A: Not supported in MVP.

---

### MVP Screens — What Exists Today

#### Screen 1 — URL Input (`/`)

Any visitor (no login required) pastes a GitHub URL, clicks **Go**, and gets routed to results. Includes a "Try sample repo" shortcut. Works for public repos without any account.

#### Screen 2 — Repo Hub (`/repos`)

After GitHub OAuth sign-in, the student sees their profile sidebar (avatar, name, follower counts) and a full grid of their repos (public and private). One click on any card triggers the same analysis flow as the URL input.

#### Screen 3 — Results Dashboard (`/r/[id]`)

Five tabs, each mapping to an SDLC phase the student can improve:

| Tab | SDLC Phase | What a student learns |
|-----|------------|----------------------|
| **Behavioral** | Git workflow | Am I committing small and often? Am I working in bursts? |
| **Verification** | Testing | Do my commits touch tests? Is my test ratio healthy? |
| **Quality** | Code health | Is my code too complex? Is it maintainable? Is there duplication? |
| **React & TSX** | Component design | Are my components monolithic? Am I prop-drilling? |
| **AI Smells** | Code pathology | Are there silent failures, suspicious refactoring patterns? |

Plus a **GitHub metadata panel** (languages, contributors, stars/forks) and **Export JSON** for sharing or saving results.

---

### The Intelligent Assistant — What's Possible With Existing Data

The full `report_json` already contains everything an AI assistant would need. The data is rich and structured. Three realistic v1 approaches:

**Option A — Inline rule-based insights (no AI cost)**

The engine already produces traffic-light thresholds (green/yellow/red). The assistant could be a panel that reads those and generates pre-written, phase-specific coaching sentences. Example: if `largeCommitRatio > 0.3`, show "30%+ of your commits are over 500 lines — try committing smaller logical units more frequently." No API key needed, deterministic, fast.

**Option B — LLM summary panel (OpenAI / Anthropic)**

Pass a condensed version of `report_json` (key scores only, not all per-file data) to an LLM and ask it to write 3–5 prioritized, student-friendly recommendations. This adds an API cost per analysis but produces richer, conversational output. The summary could live in a 6th tab ("Assistant") or a collapsible sidebar panel.

**Option C — Chat interface**

A student types "Why is my Behavioral score yellow?" and the assistant answers using the actual report numbers. This is higher effort but most engaging for students actively trying to improve.

> Screen 3 includes a planned "Assistant" panel or tab that reads the student's scores and explains, in plain language, what to improve and why — surfacing the most impactful SDLC gap first.

---

**Q: What is explicitly OUT of scope?**

A:

- Instructor/research dashboards
- Cross-student comparison
- Class-level analytics
- AI prompt tracking
- LMS integrations (Canvas, Gradescope)
- Scheduled analysis

---

**Q: Are there academic tools this needs to connect with?**

A: Not for MVP.

---

**Q: Anything else about screens and scope?**

A: Focus on clarity, fast feedback, and minimal friction (e.g., paste URL → get results).

---

## 5. Existing Work & Design Direction

- **Existing screens:** The full app is live at `https://ts-repo-metrics-production.up.railway.app` (staging: `https://ts-repo-metrics-development.up.railway.app`). All 5 tabs, the repos hub, and the URL hero exist and are functional. Designer should review these before opening Figma.
- **Brand / UCSC guidelines:** None enforced yet. Current theme uses Geist (Vercel), Tailwind dark/light, neutral palette. Designer has freedom to apply UCSC brand.
- **Feel:** Leans modern tech product (dot-grid bg, shadcn/ui components). The student audience suggests keeping it approachable and actionable rather than dense/academic.
- **References:** The `/repos` hub is inspired by the GitHub profile page layout. Tab results are inspired by code-quality dashboards (SonarQube-style traffic lights). Additional references: Greptile, CodeRabbit.
- **Devices:** Primarily **laptops** (students working in VS Code / browser). Mobile is supported but secondary. No large-monitor lab context assumed yet.

---

**Q: Is there a UCSC brand guideline?**

A: Not enforced yet.

---

### Feel & Design Direction

Not academic. Not a research dashboard. Think: **developer leveling up.**

Closest references: GitHub's contribution graph meets Duolingo's progress feedback meets Linear's clean UI. Students should feel like they're checking their dev stats, not reading a research paper.

---

### Gamification — What the Existing Data Already Supports

#### Scores & Levels (already computable)

Each of the 5 SDLC tabs already produces green/yellow/red thresholds. These map naturally to levels:

| Level | Threshold | Feel |
|-------|-----------|------|
| **Beginner** | Red across most tabs | "Here's where to start" |
| **Developing** | Mostly yellow | "You're making progress" |
| **Proficient** | Mostly green | "Strong foundations" |
| **Expert** | Green + low smells | "Ship-ready code" |

#### Streaks & Commit Behavior

The behavioral tab already tracks commit frequency (`commitsPerWeek`), burst patterns, and large-commit ratio. This is exactly the data behind a "commit streak" or "consistency badge."

#### Badges / Achievements (zero new data needed)

Examples derivable from the current report:

- **"Small Commits"** — `largeCommitRatio < 0.1`
- **"Test Coupler"** — `pctCommitsTouchingTests > 50%`
- **"No Smells"** — zero long functions, no empty catches
- **"Refactorer"** — `refactorCommitRatio > 0.2`
- **"Complexity Slayer"** — avg cyclomatic complexity < 5

#### Progress Over Time

Right now each analysis is a snapshot. Re-running creates a new result keyed to the new commit SHA. With a small addition (store `user_id + repo + commitSha + scores` over time), you could show a "Your Quality score went from 62 → 81 over 3 commits" progress chart — very motivating for students.

#### SDLC Phase XP Bar

Instead of tab labels ("Behavioral", "Verification"), show them as skill trees or XP bars — a student is at Level 2 in Testing, Level 4 in Quality, etc.

---

### For the UX Designer Brief

> **Tone:** Modern developer tool, not academic software. Think Linear, Vercel, GitHub — clean, dark-mode-first, data-dense but readable.
>
> **Gamification layer:** Each SDLC phase should feel like a skill the student is leveling up. Scores are XP. Traffic-light thresholds become level gates. Achievements/badges are derivable from existing metrics with no backend changes.
>
> **Student emotional goal:** "I want to come back after my next commit to see if my score improved" — not "I have to submit this for my grade."

---

**Q: Are there competitor tools or references?**

A:

- GitHub (repo layout inspiration)
- SonarQube (metric visualization)
- Greptile
- CodeRabbit

---

**Q: What devices will this be used on?**

A: Primarily laptops. Mobile is secondary.

---

**Q: Anything else about design direction?**

A: Design with real data, not assumptions. Keep interface actionable and student-friendly.

---

## 6. Timeline & Process

**Q: What are the deadlines for designs?**

A: To be defined.

---

**Q: How often should we sync?**

A: Weekly, with more frequent syncs early in the process.

---

**Q: Anything else about timeline/process?**

A: Prioritize fast iteration and early validation with real usage.

---

## Final Note

Every feature should answer:

1. What is happening?
2. Why does it matter?
3. What should the student do next?

The tool should function as a **development coach**, not just a metrics viewer.
