# Sanitized Cursor agent log sample (SIP Sprint 1)

Synthetic JSONL for **SIP-1.4** (Cursor telemetry parser). Safe to commit — no real student data, paths, or chat content.

## Files

| File | Description |
|------|-------------|
| `sample-session.jsonl` | 9-line fake Cursor agent transcript |

## Format notes

- One JSON object per line (JSONL).
- Lines use Cursor-style `role` + `message.content[]` with `type: "text"` and `type: "tool_use"`.
- Tool names included: `Read`, `Grep`, `Write`, `Shell`, `StrReplace`.
- Paths are placeholders: `/Users/student/demo-app/...`
- This sample has **no timestamps**; parsers may assign order from line index or file metadata.

## Real logs on macOS (not in repo)

Developers’ machines store transcripts under:

```text
~/.cursor/projects/<workspace>/agent-transcripts/<session-id>/<session-id>.jsonl
```

Students document the exact pattern in `agent_stats/docs/CURSOR_LOG_FORMAT.md` during Sprint 1.

## Target output

Parser work should eventually emit CSV compatible with [sample-ai-usage-trace.csv](../../../apps/dashboard/public/samples/sample-ai-usage-trace.csv) (`user_prompt`, `tool_call`, etc.).

## Related issues

- [#116 — SIP-1.4 Cursor telemetry](https://github.com/scottyUX/ts-repo-metrics/issues/116)
- [#112 — Instructor kickoff](https://github.com/scottyUX/ts-repo-metrics/issues/112)
