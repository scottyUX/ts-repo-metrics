# agent-stats setup (required for Sprint 1)

**agent-stats is a separate GitHub repo.** It is **not** included inside `ts-repo-metrics` when you clone from GitHub. Every student must clone it into a folder named `agent_stats` next to the other project folders.

## One-time setup

From the root of your `ts-repo-metrics` clone:

```bash
git clone https://github.com/scottyUX/agent_stats.git agent_stats
cd agent_stats
git checkout a2a051d0991e
cd ..
```

The checkout line pins everyone to the same version for Sprint 1 (commit message: *add --tokens and --messages flags*).

## Verify it worked

```bash
test -f agent_stats/ai_usage_stats.py && echo "OK: agent_stats is ready"
python3 agent_stats/ai_usage_stats.py --help
```

You should see help text, not "No such file."

## Smoke test (SIP-1.1)

```bash
python3 agent_stats/ai_usage_stats.py \
  --student "baseline@test.local" \
  --csv /tmp/baseline_trace.csv
```

Post the first few lines of the CSV (or note that it is empty) in [Discussion #111](https://github.com/scottyUX/ts-repo-metrics/discussions/111).

## Where to edit code (SIP-1.4)

Open Pull Requests on **https://github.com/scottyUX/agent_stats**, not on `ts-repo-metrics`. Keep your local `agent_stats/` folder as a normal git clone of that repo.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `agent_stats/` missing after cloning ts-repo-metrics only | Run the `git clone` command above |
| `Permission denied` running the script | Use `python3 agent_stats/ai_usage_stats.py` instead of `./agent_stats/...` |
| Wrong or old code | `cd agent_stats && git fetch scottyux && git checkout a2a051d0991e` |

See also: [docs/AI_USAGE_LOGS.md](../docs/AI_USAGE_LOGS.md)
