# AI Usage: analyzing uploaded CSV traces

This guide describes the current dashboard **AI Usage** tab. The tab now works from the raw
`ai_usage_trace.csv` export produced by `agent_stats`, then persists that raw CSV on the
analysis record so the metrics reload with the result page.

**For students:** see the step-by-step walkthrough in [STUDENT_AI_USAGE_GUIDE.md](./STUDENT_AI_USAGE_GUIDE.md) (sign in → analyze repo → AI Usage tab → copy prompt → upload CSV → read metrics).

The primary student workflow is now:

1. choose `Claude Code`, `Codex`, `Gemini`, or `Cursor` in the AI Usage tab
2. copy the generated prompt
3. run it in that same coding-agent project so the agent can infer `--filter`
4. upload the resulting CSV

## What you can upload

The tab accepts **CSV only**.

If students follow the new prompt-first flow in the dashboard, the copied prompt tells the agent
to clone or update `https://github.com/scottyUX/agent_stats`, run the export with `--messages`
and `--tokens`, and save the CSV to the Desktop with `--csv "$HOME/Desktop/ai_usage_trace.csv"`.

Manual fallback command:

```bash
./ai_usage_stats.py --filter your-repo-slug --messages --tokens --csv "$HOME/Desktop/ai_usage_trace.csv"
```

That command keeps the base event stream and adds the optional columns needed for:

- **Prompt quality** (`message_text`)
- **Token efficiency** (`input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`)

## CSV contract

Required columns:

- `timestamp`
- `event_type`
- `session_id`
- `tool_name`

Optional columns:

- `message_text`
- `input_tokens`
- `output_tokens`
- `cache_creation_tokens`
- `cache_read_tokens`

The parser and metric derivation logic live in
[`apps/dashboard/lib/aiUsageCsv.ts`](../apps/dashboard/lib/aiUsageCsv.ts).

## What the tab shows

The refreshed tab is student-facing and organized around:

- **Token efficiency**
- **Prompt quality**
- **Activity snapshot** with a fixed **40-day** view
- **Workflow pattern** with grouped behavioral buckets:
  - `Exploration`
  - `Generation`
  - `Verification / execution`
- **Session behavior**
- **Review habits**

Every card includes a `?` help affordance that explains:

1. what the data is
2. why it matters
3. how to improve it

## Persistence

When you upload a CSV on the AI Usage tab:

1. the browser reads the file locally
2. the dashboard parses it into metrics for immediate display
3. the raw CSV text is saved on the matching `analyses.result_id`

This is separate from `POST /api/analyze`; it uses dedicated AI Usage persistence endpoints.

## Step-by-step

1. Open a **results** view that includes the AI Usage tab (the page renders
   [`AIMaturityTab`](../apps/dashboard/components/results/rq/AIMaturityTab.tsx)).
2. Choose the platform prompt for `Claude Code`, `Codex`, `Gemini`, or `Cursor`.
3. Copy the prompt and run it in the same coding-agent project.
4. Upload the generated CSV on the AI Usage tab.
5. Review any warnings about missing optional columns.
6. Read the sections in order:
   - token efficiency
   - prompt quality
   - activity snapshot
   - workflow pattern
   - session behavior
   - review habits

## Notes

- There is **no demo data** in the current tab.
- The tab no longer accepts **JSON** or **JSONL** uploads.
- The old **AUM score** and stage-aware display are no longer part of the live student UI.

## Cursor

Cursor stores agent conversation logs as JSONL files under each project's agent-transcripts folder. The path differs by OS:

| OS | Default log path |
|----|-----------------|
| Mac / Linux | `~/.cursor/projects/*/agent-transcripts/*/*.jsonl` |
| Windows | `%USERPROFILE%\.cursor\projects\*\agent-transcripts\*\*.jsonl` |

The `agent_stats` export command for Cursor logs:

**Mac / Linux:**
```bash
./ai_usage_stats.py \
  --roots "$HOME/.cursor/projects/*/agent-transcripts/*/*.jsonl" \
  --filter your-repo-slug \
  --tokens --messages \
  --csv "$HOME/Desktop/ai_usage_trace.csv"
```

**Windows (PowerShell):**
```powershell
python ai_usage_stats.py `
  --roots "$env:USERPROFILE\.cursor\projects\*\agent-transcripts\*\*.jsonl" `
  --filter your-repo-slug `
  --tokens --messages `
  --csv "$env:USERPROFILE\Desktop\ai_usage_trace.csv"
```

> The exported CSV must set `coding_agent = cursor`. Token columns are expected to be empty — Cursor agent-transcript logs do not include usage data. Prompt quality and activity metrics still populate after upload.

## Claude Code

Claude Code stores conversation logs as JSONL files under `~/.claude/projects/`. The path is the same on Mac and Linux; Windows differs:

| OS | Default log path |
|----|-----------------|
| Mac / Linux | `~/.claude/projects/` |
| Windows | `%USERPROFILE%\.claude\projects\` |

The `agent_stats` export command for Claude Code logs:

**Mac / Linux:**
```bash
./ai_usage_stats.py \
  --roots "$HOME/.claude/projects/**/*.jsonl" \
  --filter your-repo-slug \
  --tokens --messages \
  --csv "$HOME/Desktop/ai_usage_trace.csv"
```

**Windows (PowerShell):**
```powershell
python ai_usage_stats.py `
  --roots "$env:USERPROFILE\.claude\projects\**\*.jsonl" `
  --filter your-repo-slug `
  --tokens --messages `
  --csv "$env:USERPROFILE\Desktop\ai_usage_trace.csv"
```

## Codex

Codex stores conversation logs as JSONL files under `~/.codex/sessions/`. The path is the same on Mac and Linux; Windows differs:

| OS | Default log path |
|----|-----------------|
| Mac / Linux | `~/.codex/sessions/` |
| Windows | `%USERPROFILE%\.codex\sessions\` |

The `agent_stats` export command for Codex logs:

**Mac / Linux:**
```bash
./ai_usage_stats.py \
  --roots "$HOME/.codex/sessions/**/rollout-*.jsonl" \
  --filter your-repo-slug \
  --tokens --messages \
  --csv "$HOME/Desktop/ai_usage_trace.csv"
```

**Windows (PowerShell):**
```powershell
python ai_usage_stats.py `
  --roots "$env:USERPROFILE\.codex\sessions\**\rollout-*.jsonl" `
  --filter your-repo-slug `
  --tokens --messages `
  --csv "$env:USERPROFILE\Desktop\ai_usage_trace.csv"
```

## Gemini

Gemini stores conversation logs as JSON files under `~/.gemini/tmp/`. The path is the same on Mac and Linux; Windows differs:

| OS | Default log path |
|----|-----------------|
| Mac / Linux | `~/.gemini/tmp/` |
| Windows | `%USERPROFILE%\.gemini\tmp\` |

The `agent_stats` export command for Gemini logs:

**Mac / Linux:**
```bash
./ai_usage_stats.py \
  --roots "$HOME/.gemini/tmp/**/session-*.json" \
  --filter your-repo-slug \
  --tokens --messages \
  --csv "$HOME/Desktop/ai_usage_trace.csv"
```

**Windows (PowerShell):**
```powershell
python ai_usage_stats.py `
  --roots "$env:USERPROFILE\.gemini\tmp\**\session-*.json" `
  --filter your-repo-slug `
  --tokens --messages `
  --csv "$env:USERPROFILE\Desktop\ai_usage_trace.csv"
```
