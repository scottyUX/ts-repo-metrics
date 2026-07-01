# SIP-1.7 — AI Usage Logs Discovery Report

## Executive summary

- **26 AI usage log uploads** are present in `data/analyses_rows.csv` (22.8% of 114 analysis rows), spanning **140,732 events** and **606 unique sessions** (event dates 2026-03-02 → 2026-06-11).
- Logs follow the **`ai_usage_trace.csv` contract** (`timestamp`, `event_type`, `session_id`, `tool_name` + optional message/token columns); agents are mostly **Claude Code (21 uploads)** and **Codex CLI (5 uploads)**.
- **Prompt text is partial**: 47.2% of `user_prompt` rows have non-empty `message_text`; six uploads have zero prompt text (five Codex, one Claude).
- **Biggest gap is course tagging** — 69% of AI-log uploads lack `CSE115A-Spring26`; second is the **77% of analysis rows with no AI log at all**.
- **Recommended next step**: define a “clean cohort” (exclude 2 broken/corrupt uploads), prioritize course-tagged repos with full `--messages` and `--tokens` exports, and refresh `analyses_rows.csv` on a schedule so inventory stays current.

## Cohort summary

| Metric | Value |
|--------|------:|
| Analysis rows (total) | 114 |
| Uploads with AI logs | 26 |
| Total events | 140,732 |
| Unique sessions (global) | 606 |
| Event date range | 2026-03-02 → 2026-06-11 |
| Upload date range | 2026-05-26 → 2026-06-12 |
| Broken / corrupt | 2 |
| Suspect (very small) | 1 |
| Clean | 23 |

Source: `data/analyses_rows.csv`.

## Per-upload distribution

| | Events | Sessions |
|--|-------:|---------:|
| **Min** | 3 | 1 |
| **Median** | 5,295 | 33 |
| **Max** | 17,197 | 157 |
| **Mean** | ~5,413 | ~33 |

Across 26 uploads with AI logs in `data/analyses_rows.csv`.

There are 2 problematic uploads, and 1 small issue worth flagging: 
1. Bloi-Dev — s-achawro/CWTCG (2026-05-29)
    * Effectively broken — only 3 events in a single session:
        - 2 duplicate user_prompt rows
        - 1 tool_call with no tool_result
        - Looks like an aborted Codex export
    * This repo has a good replacement upload from s-achawro on 2026-06-05 (1,163 events), so you can drop the Bloi-Dev row for analysis.
2. YangYangChao — MandoBug/InterviewPal (2026-05-29)
    * Partially corrupted — 32 events, but the last row is junk:
        - I use chatgpt and it does not show the data of AI usage,,,,,,,,,,,,
    * That row has no valid timestamp, event_type, or session_id (matches the 1 invalid timestamp in the whole dataset). The other 31 rows parse fine, but the upload is still very small and looks like an incomplete Codex trace plus a manual note appended.    
3. (small issue) HariRaghavan1 — MasonD-007/ks_MCPS (2026-06-07)
Only 15 events, 1 session, 1 user prompt — schema-valid and has tokens, but likely a truncated export, not representative usage.
- investigate: 5 codex uploads have no assistant_response events (Blo-Dev, s-achawro, sebavila14, sang-w00, InterviewPal) - that's normal for codex_cli exports, not a parse failure
- many uploads are missing message_text or tokens, the analyzer warns but they still work

## User prompt text (`message_text`)

| Metric | Value |
|--------|------:|
| `user_prompt` rows (total) | 7,424 |
| With non-empty `message_text` | 3,505 |
| **% with `message_text`** | **47.2%** |
| `assistant_response` with text | 0 |

Populated when exports include `--messages`. All 26 uploads have the column; 20 have at least one prompt with text.

### Uploads with no `message_text` (0 / N prompts)

| Login | Repo | Upload date | Agent | Prompts |
|-------|------|-------------|-------|--------:|
| Bloi-Dev | s-achawro/CWTCG | 2026-05-29 | codex_cli | 2 |
| HariRaghavan1 | MasonD-007/ks_MCPS | 2026-06-07 | claude_code | 1 |
| s-achawro | s-achawro/CWTCG | 2026-06-05 | codex_cli | 46 |
| sebavila14 | ismilesen/circuit-simulation | 2026-06-07 | codex_cli | 450 |
| sang-w00 | dareumHJ/sluggym | 2026-06-05 | codex_cli | 674 |
| YangYangChao | MandoBug/InterviewPal | 2026-05-29 | codex_cli | 7 |

Five of six are `codex_cli`; HariRaghavan1 is the only `claude_code` upload with no prompt text.

## Assistant replies and tool inputs

| Question | Yes / No |
|----------|----------|
| Assistant reply **events** (`assistant_response` rows) | **Yes** |
| Assistant reply **text** (non-empty `message_text` on those rows) | **No** (0 / 55,291) |
| Tool call **events** (`tool_call` rows) | **Yes** |
| Tool **inputs** (dedicated column or any non-empty text on tool rows) | **No** |
| Tool result **events** (`tool_result` rows) | **Yes** |
| Tool **output text** (non-empty `message_text` on result rows) | **No** (0 / 38,484) |

Columns present: `timestamp`, `event_type`, `session_id`, `tool_name`, `coding_agent`, `working_dir`, `execution_time`, `message_text`, token fields, `model`. No `tool_input`, `args`, or result-body column.

## Token counts

| Metric | Value |
|--------|------:|
| Uploads with token columns | 26 / 26 |
| Uploads with any token data | 21 / 26 |
| Uploads with no token data | 5 / 26 |
| Events with token data | 55,291 / 140,732 (39.3%) |
| Tokens on `assistant_response` | 55,291 / 55,291 (100%) |
| Tokens on `user_prompt` / `tool_call` / `tool_result` | 0 |

Populated when exports include `--tokens`. All four columns (`input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`) are filled together on the same `assistant_response` rows.

### With token data (21)

| Login | Repo | Upload date | Agent | Assistant rows w/ tokens |
|-------|------|-------------|-------|-------------------------:|
| MikeyZv | MikeyZv/SlugMarket | 2026-06-03 | claude_code | 3,224 |
| ozaitgiv | apagadua/shoe_shopper | 2026-06-04 | claude_code | 6,097 |
| B1ggestB | scottyUX/IstanbulMedic-Connect | 2026-06-11 | claude_code | 8,211 |
| helloswayamshah | microfaults/manteion-go | 2026-06-12 | claude_code | 6,121 |
| helloswayamshah | microfaults/zeus-go | 2026-06-07 | claude_code | 5,895 |
| Nxver-GitHub | Nxver-GitHub/Nodegent | 2026-06-08 | claude_code | 4,719 |
| svante92 | royshadmon/EADS | 2026-06-02 | claude_code | 807 |
| ismilesen | ismilesen/circuit-simulation | 2026-06-03 | claude_code | 1,998 |
| scottyUX | scottyUX/ts-repo-metrics | 2026-06-04 | claude_code | 3,223 |
| scottyUX | s-achawro/CWTCG | 2026-05-29 | claude_code | 2,424 |
| scottyUX | scottyUX/ts-repo-metrics | 2026-05-26 | claude_code | 2,419 |
| Ninjamrcool | franklinwangg/AutoShake | 2026-05-28 | claude_code | 2,419 |
| scottyUX | scottyUX/ts-repo-metrics | 2026-05-26 | claude_code | 2,399 |
| scottyUX | scottyUX/ts-repo-metrics | 2026-05-26 | claude_code | 2,399 |
| anguy480 | Colin-Posat/SlugFound | 2026-06-09 | claude_code | 519 |
| HariRaghavan1 | MasonD-007/ks_MCPS | 2026-06-07 | claude_code | 9 |
| mvongnakhone | mvongnakhone/SmartMenu | 2026-06-07 | claude_code | 1,146 |
| Colin-Posat | Colin-Posat/SlugFound | 2026-06-07 | claude_code | 198 |
| dareumHJ | dareumHJ/sluggym.git | 2026-06-05 | claude_code | 615 |
| Kaankocc | Aicnev04/PriceYourPlaylist | 2026-06-08 | claude_code | 243 |
| T0RAA | DAWLab-cse115/DAWLab-FrontEnd | 2026-06-09 | claude_code | 206 |

### Without token data (5)

| Login | Repo | Upload date | Agent |
|-------|------|-------------|-------|
| Bloi-Dev | s-achawro/CWTCG | 2026-05-29 | codex_cli |
| s-achawro | s-achawro/CWTCG | 2026-06-05 | codex_cli |
| sebavila14 | ismilesen/circuit-simulation | 2026-06-07 | codex_cli |
| sang-w00 | dareumHJ/sluggym | 2026-06-05 | codex_cli |
| YangYangChao | MandoBug/InterviewPal | 2026-05-29 | codex_cli |

All five without token data are `codex_cli`.

## Computable metrics (`analyzeAiUsageCsv`)

Source: [`apps/dashboard/lib/aiUsageCsv.ts`](../../apps/dashboard/lib/aiUsageCsv.ts). Run `analyzeAiUsageCsv(csvText)` per `ai_usage_csv` row.

### Tier A — all 26 uploads (required columns only)

Requires `timestamp`, `event_type`, `session_id`, `tool_name` only.

| Field | Computable? |
|-------|-------------|
| `totalPrompts` | Yes |
| `totalSessions` | Yes |
| `totalToolCalls` | Yes |
| `toolCallsPerPrompt` | Yes |
| `avgIterationsPerPrompt` | Yes |
| `avgPromptsPerSession` | Yes |
| `avgSessionLengthTools` | Yes |
| `toolMix`, `toolDiversity`, `mostUsedTool` | Yes |
| `behavioralMix`, `behavioralDiagnostic` | Yes |
| `writeRatio` | Yes |
| `globalVerificationRatio` | Yes |
| `activeDays`, `activeDaysWindowStart`, `activeDaysWindowEnd` | Yes |
| `uniqueDays`, `avgPromptsPerDay`, `busiestDay` | Yes |

Use **23 uploads** if excluding BROKEN (Bloi-Dev) and CORRUPT (InterviewPal).

### Tier B — token fields (21 uploads)

Requires non-empty token values on `assistant_response` (`--tokens`).

| Field | Computable? |
|-------|-------------|
| `hasTokenData` | Yes on 21; **false** on 5 Codex uploads |
| `totalInputTokens`, `totalOutputTokens` | Yes (21) |
| `totalCacheReadTokens`, `totalCacheCreationTokens` | Yes (21) |
| `totalTokens`, `cacheHitRate` | Yes (21) |

### Tier C — prompt-quality fields (20 uploads)

Requires non-empty `message_text` on at least one `user_prompt` (`--messages`).

| Field | Computable? |
|-------|-------------|
| `hasMessageData` | Yes on 20; **false** on 6 uploads |
| `promptsWithText`, `messageCaptureRate` | Yes (20) |
| `avgPromptLength` | Yes (20) |
| `shortPromptRate`, `detailedPromptRate` | Yes (20) |

Cohort-wide prompt text capture: **47.2%** of `user_prompt` rows.

### Tier summary

| Tier | Uploads | Coverage |
|------|--------:|----------|
| A — core behavioral | 26 (23 clean) | Volume, tools, buckets, review ratio, activity |
| B — + tokens | 21 | Tier A + token efficiency |
| C — + prompt quality | 20 | Prompt-quality fields (overlap with B; not all 20 have tokens) |

## Not in `aiUsageCsv` — same data, extra script

| Metric | Computable? | Coverage / notes |
|--------|-------------|------------------|
| `execution_time` stats (median, p95 by tool) | Yes | ~98% of `tool_result` rows |
| `working_dir` → SDLC stage (`classifyStageByPath`) | Partial | ~37% of events have `working_dir` |
| `coding_agent` breakdown | Yes | ~100% of events |
| `model` breakdown | Yes | 21 Claude uploads (`assistant_response` only) |
| Join to `report_json` (structural metrics) | Yes | All 26 AI log rows |

## Ranked gaps

### 1. No course tag — largest gap

| Scope | Count | % |
|-------|------:|--:|
| All analysis rows | 98 / 114 | 86% |
| AI log uploads only | 18 / 26 | 69% |

Only **8 uploads** have `CSE115A-Spring26`: ismilesen, Bloi-Dev, svante92, ozaitgiv, Colin-Posat, HariRaghavan1, s-achawro, YangYangChao.

### 2. No AI log upload — second largest

| Scope | Count | % |
|-------|------:|--:|
| Analysis rows without `ai_usage_csv` | 88 / 114 | 77% |
| Unique repos with no log ever | 43 / 62 | 69% |

Only **19 unique repos** have any upload (26 rows including repeats).

### 3. No messages

| Scope | Count | % |
|-------|------:|--:|
| Uploads with zero prompt text | 6 / 26 | 23% |
| `user_prompt` rows without text | 3,919 / 7,424 | 52.8% |

**Zero messages:** Bloi-Dev, HariRaghavan1, s-achawro (Codex), sebavila14, sang-w00, YangYangChao (5 Codex + 1 Claude).

### 4. No tokens — smallest of the four

| Scope | Count | % |
|-------|------:|--:|
| Uploads with empty token columns | 5 / 26 | 19% |

All five are `codex_cli`: Bloi-Dev, s-achawro, sebavila14, sang-w00, YangYangChao.

## Worst uploads (multi-gap)

| Rank | Upload | Gaps | Notes |
|------|--------|------|-------|
| 1 | sang-w00 / dareumHJ/sluggym | no messages, no tokens, no course | Codex |
| 2 | sebavila14 / ismilesen/circuit-simulation | no messages, no tokens, no course | Codex; repo also has ismilesen upload |
| 3 | YangYangChao / MandoBug/InterviewPal | no messages, no tokens | CORRUPT; has course |
| 4 | Bloi-Dev / s-achawro/CWTCG | no messages, no tokens | BROKEN; has course; superseded |
| 5 | s-achawro / s-achawro/CWTCG (Codex) | no messages, no tokens | Has course; superseded by Claude upload |
| 6 | HariRaghavan1 / MasonD-007/ks_MCPS | no messages only | SUSPECT (15 events); has course + tokens |

## Open questions for the team

1. **Clean cohort definition** — Should analysis exclude Bloi-Dev (broken) and InterviewPal (corrupt) by default, or keep them flagged in a separate QA bucket?
2. **Export refresh cadence** — How often will we re-export `analyses_rows.csv`, and who regenerates `ai_logs_inventory.csv` when new uploads arrive?
3. **Codex token gap** — All five token-less uploads are Codex CLI; do we require Claude-only logs for token-efficiency research, or invest in Codex `--tokens` export support?
4. **Course tag enforcement** — Can the dashboard submission flow require `course_id` so the 69% untagged AI-log gap shrinks without manual backfill?
5. **Duplicate uploads** — For repos with multiple uploads (e.g. `scottyUX/ts-repo-metrics` ×4), do we pick latest, largest, or best-completeness row per repo for cohort studies?