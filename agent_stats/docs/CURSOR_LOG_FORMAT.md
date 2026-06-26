# Cursor Log Format

This document describes the JSON Lines format Cursor writes for its chat/composer sessions and explains how the `parse_cursor_jsonl()` function maps those fields to the `ai_usage_trace.csv` columns the dashboard expects.

---

## Where Cursor stores logs 
```
~/Library/Application Support/Cursor/User/workspaceStorage/<hash>/
~/Library/Application Support/Cursor/logs/<date>/
```

Each file is a `.jsonl` file — **one JSON object per line**. The parser searches those paths by default; pass `--roots` to override.

---

## Line types

A Cursor JSONL file mixes four kinds of lines. Every field is optional at the JSON level; the parser skips anything it can't classify.

### 1. User message (`role: "user"`)

Fired when the student sends a prompt in Cursor Composer or the chat panel.

```json
{
  "role": "user",
  "content": "Find and fix the auth bug",
  "timestamp": "2026-05-12T14:00:00.000Z",
  "session_id": "cursor-session-001",
  "working_dir": "/home/student/my-project"
}
```

| Field | Notes |
|---|---|
| `role` | Always `"user"` for this type |
| `content` | The student's typed message (also appears as `text` in some versions) |
| `timestamp` | ISO 8601; used as the CSV `timestamp` column |
| `session_id` | Groups related turns; maps directly to `session_id` in the CSV |
| `working_dir` | Workspace root open in Cursor at send time |

### 2. Tool call (`type: "tool_call"`)

Fired each time the AI invokes one of Cursor's built-in tools.

```json
{
  "type": "tool_call",
  "tool": "read_file",
  "args": { "path": "src/auth/token.ts" },
  "timestamp": "2026-05-12T14:00:09.000Z",
  "session_id": "cursor-session-001"
}
```

| Field | Notes |
|---|---|
| `type` | Always `"tool_call"` |
| `tool` | Raw Cursor tool name (see mapping table below) |
| `args` | Tool arguments — not written to the CSV, used for context only |
| `timestamp` | ISO 8601 |

### 3. Tool result (`type: "tool_result"`)

Records the outcome of a tool call. **The parser skips these rows.** The dashboard only uses `tool_call` events to count tool activity; result rows add no information to the CSV columns.

```json
{
  "type": "tool_result",
  "tool": "edit_file",
  "success": true,
  "timestamp": "2026-05-12T14:00:16.000Z",
  "session_id": "cursor-session-001"
}
```

### 4. Assistant message (`role: "assistant"`)

Fired after the AI finishes responding. Carries token usage.

```json
{
  "role": "assistant",
  "content": "I fixed the token validation…",
  "timestamp": "2026-05-12T14:00:28.000Z",
  "session_id": "cursor-session-001",
  "model": "claude-3-5-sonnet-20241022",
  "usage": {
    "prompt_tokens": 2100,
    "completion_tokens": 480
  }
}
```

| Field | Notes |
|---|---|
| `role` | Always `"assistant"` |
| `model` | Model ID string; written to `model` column |
| `usage.prompt_tokens` | Maps to CSV `input_tokens` |
| `usage.completion_tokens` | Maps to CSV `output_tokens` |
| `usage.input_tokens` | Alternate field name (some Cursor versions) |
| `usage.output_tokens` | Alternate field name |

> **Note on cache tokens:** Cursor does not expose `cache_creation_tokens` or `cache_read_tokens` in its log format. Those columns are left empty in the CSV output; the dashboard treats empty token columns as "unavailable" and omits token-efficiency cards.

---

## Cursor tool name → CSV tool name mapping

The dashboard's behavioral buckets (Exploration / Generation / Verification) classify tools by name pattern. The parser maps Cursor's tool names to names the dashboard recognizes:

| Cursor `tool` value | CSV `tool_name` | Dashboard bucket |
|---|---|---|
| `read_file` | `Read` | Exploration |
| `grep_search` | `Grep` | Exploration |
| `codebase_search` | `codebase_search` | Exploration |
| `file_search` | `Glob` | Exploration |
| `list_dir` | `Glob` | Exploration |
| `web_search` | `WebSearch` | Exploration |
| `edit_file` | `Edit` | Generation |
| `create_file` | `Write` | Generation |
| `run_terminal_cmd` | `Bash` | Verification |
| `delete_file` | `Bash` | Verification |
| *(any other value)* | passed through unchanged | Generation (fallback) |

---

## CSV column mapping summary

| CSV column | Source field | Present for |
|---|---|---|
| `timestamp` | `timestamp` | all events |
| `event_type` | derived from `role` / `type` | all events |
| `coding_agent` | hardcoded `"cursor"` | all events |
| `tool_name` | `tool` (mapped) | `tool_call` only |
| `execution_time` | not available | — (empty) |
| `working_dir` | `working_dir` | user messages |
| `session_id` | `session_id` | all events |
| `message_text` | `content` / `text` | `user_prompt` only |
| `input_tokens` | `usage.prompt_tokens` or `usage.input_tokens` | `assistant_response` only |
| `output_tokens` | `usage.completion_tokens` or `usage.output_tokens` | `assistant_response` only |
| `cache_creation_tokens` | not available | — (empty) |
| `cache_read_tokens` | not available | — (empty) |
| `model` | `model` | `assistant_response` only |

---

## Comparison with the Claude Code parser

The existing Claude Code parser in `ai_usage_stats.py` reads a similar JSONL structure but with different field names:

| Concept | Claude Code field | Cursor field |
|---|---|---|
| User turn | `type: "user"` | `role: "user"` |
| Tool invocation | `type: "tool_use"` with `name` | `type: "tool_call"` with `tool` |
| Token usage | `usage.input_tokens` / `usage.output_tokens` | `usage.prompt_tokens` / `usage.completion_tokens` |
| Session boundary | `session_id` on every record | `session_id` on every record |
| Cache tokens | `usage.cache_creation_input_tokens` | not available |

The core parsing strategy is identical: iterate lines → classify by role/type → emit one CSV row per relevant event.

---

## Robustness rules

- **Blank lines** are silently skipped.
- **Malformed JSON** (lines that are not valid JSON objects) are silently skipped; a warning is printed to stderr when `--verbose` is set.
- **Missing fields** (`timestamp`, `session_id`, etc.) produce an empty string in the corresponding CSV column rather than crashing.
- **Empty files** produce a valid CSV with only the header row.

---

## Default log search paths (macOS)

```
~/Library/Application Support/Cursor/User/workspaceStorage/
~/Library/Application Support/Cursor/logs/
```

The parser recurses into all subdirectories under those roots and collects every `*.jsonl` file.  Pass `--roots /path/to/dir` to restrict or redirect the search.
