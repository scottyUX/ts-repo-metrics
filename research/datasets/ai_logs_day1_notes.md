Analysis records: 114; With AI logs: about 22.81%

| Team / login | Repo | Course tag | Date |
| --- | --- | --- | --- |
| scottyUX | scottyUX/ts-repo-metrics | — | 2026-05-26 |
| scottyUX | scottyUX/ts-repo-metrics | — | 2026-05-26 |
| scottyUX | scottyUX/ts-repo-metrics | — | 2026-05-26 |
| Ninjamrcool | franklinwangg/AutoShake | — | 2026-05-28 |
| scottyUX | s-achawro/CWTCG | — | 2026-05-29 |
| CWTCG / Bloi-Dev | s-achawro/CWTCG | CSE115A-Spring26 | 2026-05-29 |
| interview pal / YangYangChao | MandoBug/InterviewPal | CSE115A-Spring26 | 2026-05-29 |
| EADS / svante92 | royshadmon/EADS | CSE115A-Spring26 | 2026-06-02 |
| MikeyZv | MikeyZv/SlugMarket | — | 2026-06-03 |
| Circuit Simulator / ismilesen | ismilesen/circuit-simulation | CSE115A-Spring26 | 2026-06-03 |
| scottyUX | scottyUX/ts-repo-metrics | — | 2026-06-04 |
| ShoeShopper / ozaitgiv | apagadua/shoe_shopper | CSE115A-Spring26 | 2026-06-04 |
| sang-w00 | dareumHJ/sluggym | — | 2026-06-05 |
| dareumHJ | dareumHJ/sluggym.git | — | 2026-06-05 |
| CWTCG / s-achawro | s-achawro/CWTCG | CSE115A-Spring26 | 2026-06-05 |
| helloswayamshah | microfaults/zeus-go | — | 2026-06-07 |
| Keysight AI Agent of Agents / HariRaghavan1 | MasonD-007/ks_MCPS | CSE115A-Spring26 | 2026-06-07 |
| SlugFound / Colin-Posat | Colin-Posat/SlugFound | CSE115A-Spring26 | 2026-06-07 |
| mvongnakhone | mvongnakhone/SmartMenu | — | 2026-06-07 |
| sebavila14 | ismilesen/circuit-simulation | — | 2026-06-07 |
| Nxver-GitHub | Nxver-GitHub/Nodegent | — | 2026-06-08 |
| Kaankocc | Aicnev04/PriceYourPlaylist | — | 2026-06-08 |
| anguy480 | Colin-Posat/SlugFound | — | 2026-06-09 |
| T0RAA | DAWLab-cse115/DAWLab-FrontEnd | — | 2026-06-09 |
| B1ggestB | scottyUX/IstanbulMedic-Connect | — | 2026-06-11 |
| helloswayamshah | microfaults/manteion-go | — | 2026-06-12 |

Yes. Among the 26 AI-log uploads, 18 are unique repos and 5 repos have more than one upload (8 rows are repeat uploads).

| Repo | Uploads | Who / when |
| --- | ---: | --- |
| scottyUX/ts-repo-metrics | 4 | scottyUX — 2026-05-26 (×3), 2026-06-04 |
| s-achawro/CWTCG | 3 | scottyUX (2026-05-29); CWTCG / Bloi-Dev (2026-05-29); CWTCG / s-achawro (2026-06-05) |
| ismilesen/circuit-simulation | 2 | Circuit Simulator / ismilesen (2026-06-03); sebavila14 (2026-06-07) |
| Colin-Posat/SlugFound | 2 | SlugFound / Colin-Posat (2026-06-07); anguy480 (2026-06-09) |
| dareumHJ/sluggym | 2 | dareumHJ (2026-06-05); sang-w00 (2026-06-05) |

## Export columns (`data/analyses_rows.csv`)
| Column | What it is |
| --- | --- |
| `id` | Row id in the export (likely export/DB artifact) |
| `result_id` | Primary key for one analysis run |
| `repo_url` | GitHub repo analyzed |
| `commit_sha` | Commit analyzed |
| `analyzed_at` | When the analysis was saved |
| `report_json` | Full structural metrics report (large JSON) |
| `summary_json` | Present in export; not referenced in app code |
| `user_id` | Supabase auth user (pseudonymous UUID) |
| `course_id` | Course tag (e.g. `CSE115A-Spring26`) |
| `team_name` | Team label from submission flow |
| `github_login` | GitHub login on the analysis |
| `doc_review_json` | Doc-review agent output (separate feature) |
| `ai_usage_csv` | Raw uploaded `ai_usage_trace.csv` text |

## Export columns that matter for AI log work

**Essential**

| Column | Why |
| --- | --- |
| `ai_usage_csv` | The actual AI session log payload |
| `result_id` | Unique key per upload/analysis |
| `repo_url` | Links logs to the repo under study |
| `analyzed_at` | Upload/analysis date |

**Important for cohort / audit**

| Column | Why |
| --- | --- |
| `github_login` | Who uploaded (with `team_name` when set) |
| `team_name` | Team identity for shared repos |
| `course_id` | Course cohort tag |
| `commit_sha` | Ties AI usage to a specific code snapshot |

**Useful for joins**

| Column | Why |
| --- | --- |
| `report_json` | Structural repo metrics to compare with AI behavior |
| `user_id` | Stable pseudonymous identity across uploads |

**Low priority for AI log work**

| Column | Why |
| --- | --- |
| `doc_review_json` | Unrelated to AI usage traces |
| `summary_json` | Not used in app code; role unclear |
| `id` | Redundant if you already have `result_id` |

## AI log CSV schema (`ai_usage_trace.csv`)

One row per event, sorted by `timestamp`, grouped by `session_id`.

### Required

| Column | Description |
| --- | --- |
| `timestamp` | Event time (ISO datetime) |
| `event_type` | `user_prompt`, `tool_call`, `tool_result`, `assistant_response` |
| `session_id` | Session grouping key |
| `tool_name` | Tool invoked; empty for prompts/responses |

### Optional

| Column | Description |
| --- | --- |
| `coding_agent` | `claude_code`, `codex_cli`, `gemini_cli` |
| `execution_time` | Tool duration (seconds) |
| `working_dir` | Project directory for the event |
| `message_text` | User prompt text (export with `--messages`) |
| `input_tokens` | Input tokens (export with `--tokens`) |
| `output_tokens` | Output tokens (export with `--tokens`) |
| `cache_creation_tokens` | Cache-write tokens (export with `--tokens`) |
| `cache_read_tokens` | Cache-read tokens (export with `--tokens`) |
| `model` | Model name (export with `--tokens`; Claude Code) |

## Coding agents in uploaded logs

From 26 uploads in `data/analyses_rows.csv` (140,732 total events). No `gemini_cli` in this export.

### By event

| Agent | Events | Share |
| --- | ---: | ---: |
| `claude_code` | 120,666 | 85.7% |
| `codex_cli` | 20,065 | 14.3% |
| `(empty)` | 1 | ~0% |

### By upload

| Agent | Uploads |
| --- | ---: |
| `claude_code` | 21 |
| `codex_cli` | 5 |
| `(empty)` | 1 |

25 uploads are single-agent only; 1 is mixed (`YangYangChao` / `MandoBug/InterviewPal`: 31 `codex_cli`, 1 empty `coding_agent`).
