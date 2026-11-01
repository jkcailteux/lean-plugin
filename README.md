# lean: a token-lean Claude Code plugin

Every feature in this plugin was benchmarked against vanilla Claude Code and kept only if it measurably helped. See [REPORT.md](REPORT.md) for what was tried, what won, what lost, and by how much.

## What you get (on by default)

| Feature | How it works | Measured effect |
|---|---|---|
| **Repo map** | SessionStart hook injects a ~1.3k-token map of the repo (files + top-level symbols as `name:line`), cached per git HEAD. | Exploration: -54% turns, -20% cost. Lookups: skips reading whole files to find symbols. |
| **BatchEdit** | MCP tool: many exact search/replace edits across files in one call, no prior Read needed, all-or-nothing per file. | Multi-file edits: -82% turns, -37% cost, -50% wall time. |
| **Context guard** | UserPromptSubmit hook. Resuming a 150k+ token session after the 1-hour prompt cache expired: blocks that one prompt and suggests `/compact` (send again to go ahead). Past 250k tokens: a one-time tip. | Simulated on real history: -38% to -45% of spend if you compact when prompted. |
| **MultiRead** | MCP tool: several files or line ranges in one call. | Removing it raised cost 10% and exploration turns 4x. |
| **RunCompact** | MCP tool: runs tests/builds and returns only exit status, failures with context, and the tail. | A 320-test run: ~4k tokens down to ~300. |
| **UsageStats** + `/lean:stats` | This project's recent cost at API prices, per-tool output sizes, and what lean saved in tokens, round trips, dollars and model time (tool calls and guard-prompted `/compact`s). | Visibility only; savings are estimates. |
| **lean:scout** agent | Haiku read-only lookup agent returning `file:line` lists. | Not benchmarked (optional). |

Measured together against vanilla Claude Code (8 tasks, two independent runs, every task passing): **-18% to -28% cost, -43% to -47% turns, -25% to -28% wall time, -34% to -39% output tokens.**

## Recommended setting (not something a plugin can set)

The biggest cost in long sessions is context size: every turn re-reads the whole conversation. Claude Code can compact sooner. Add this to `~/.claude/settings.json`:

```json
{ "autoCompactWindow": 200000 }
```

Simulated on 70 real sessions, that cuts spend by about 50-60%. The trade-off: compaction summarizes older detail, so Claude may re-read some files afterwards (the simulation charges for that).

## Off by default (tested, didn't pay off)

Each passes its mechanism tests; none improved benchmarks or matched real usage. Details in [REPORT.md](REPORT.md). The read/grep/bash hooks are not even registered by default (each would add ~55 ms per tool call). To try them: merge `plugins/lean/hooks/experimental-hooks.json` into `plugins/lean/hooks/hooks.json`, then list the features in `features.json` or `LEAN_FEATURES`.

| Flag | What it does | Why it's off |
|---|---|---|
| `readcache` | Denies an identical re-read of an unchanged file | Claude Code almost never re-reads (0 of 615 reads in real history) |
| `bigread` | Full read of a 300+ line code file returns an outline; adds `ReadSymbol` | Never triggered: with the repo map, Claude already reads line ranges |
| `outline` | `Outline` tool | Claude never chose to call it |
| `datapeek` | Read of a big JSON/CSV/log returns a summary | Claude queries data with jq/grep and never Reads it |
| `junkfilter` | Grep excludes lockfiles, minified files and build output | Saves ~140 tokens per grep in a polluted repo; can hide real code in `build/` |
| `bashcompact` | Rewrites test/build Bash commands through the compactor | Redundant with RunCompact, which Claude already uses |
| `slim` | Hides the core tools | Experiment: made things worse |
| `unstable` | Adds a timestamp to session context | Experiment: prompt-cache effect, none measured |

## Install in Claude Code

Requires Node.js 18 or newer. No npm install: the plugin has no dependencies.

**Try it for one session:**

```bash
claude --plugin-dir /path/to/lean-plugin/plugins/lean
```

**Install it for good** (inside Claude Code):

```
/plugin marketplace add /path/to/lean-plugin
/plugin install lean@lean-marketplace
```

Restart Claude Code. Check it loaded with `/plugin` (lean should be enabled) and `/mcp` (the `plugin:lean:tools` server should be connected).

**Share it:** push this folder to GitHub, then anyone can run `/plugin marketplace add <owner>/<repo>` and `/plugin install lean@lean-marketplace`.

**Uninstall:** `/plugin uninstall lean@lean-marketplace`.

## Configure

- `plugins/lean/features.json`: the default feature list.
- `LEAN_FEATURES=repomap,batchedit,junkfilter claude`: override for one session (comma or `+` separated; empty string turns everything optional off).
- `.claude/lean-notes.md` in a project: injected into every session there.
- Context guard thresholds: `LEAN_GUARD_IDLE_MIN` (default 58), `LEAN_GUARD_MIN_CTX` (150000), `LEAN_GUARD_LARGE_CTX` (250000).
- Files live in `~/.claude/lean/` (savings log, hook state, repo-map cache). Delete the folder any time. Usage stats come from Claude Code's own transcripts, so nothing is logged per tool call.
- `/lean:stats` (or "show lean stats for the last 72h") prices each turn from the transcript's token counts at API list prices, then credits lean with: output each tool kept out of context (one cache write plus a re-read on every later turn until compaction), each round trip saved (at that session's average turn cost and the median turn time), and each context-guard block that was followed by `/compact`. Not counted: the repo map's shorter exploration, which only the benchmark measures. On a subscription, read the dollars as usage-limit headroom.

Default hooks run once per session (SessionStart) and once per prompt (UserPromptSubmit), never per tool call. They never grant permissions, and every block or denial says how to go ahead anyway (send or repeat the same thing).

## Test

```bash
node --test plugins/lean/test/features.test.mjs
```

24 mechanism tests: every hook and tool runs as a real subprocess with the JSON Claude Code sends, against a generated fixture repo.

## Benchmark

```bash
node bench/bench.mjs --arms base,lean --runs 3
```

- Arms: `base` = vanilla Claude Code; `name=f1+f2` = lean with exactly those features; append `@task1+task2` to limit an arm's tasks.
- Vanilla isolation: user settings, plugins, hooks and claude.ai connectors are switched off in every arm, and each arm works in a throwaway clone.
- `bench/tasks.json` holds 8 tasks: 3 on a real Next.js repo (pass `--repo`), 5 on a generated fixture (`bench/fixture.mjs`) built to trigger each feature. Answers and edits are checked automatically.
- `node bench/analyze.mjs bench/results/<run>` explains a run from the transcripts: tool calls per session, output tokens per tool, re-reads, and which lean hooks fired.
- `node bench/opportunity.mjs` sizes each idea against your own `~/.claude/projects` history before you build it.
- `node bench/history.mjs` finds what drives cost in your history (cache reads vs writes vs output, idle cache misses, long contexts, failed calls, batchable edits).
- `node bench/simulate.mjs` re-prices your real sessions under different compaction policies (`LEAN_SIM_REREAD` sets the re-read penalty).
- Every run costs real money (tasks x arms x runs sessions, roughly $0.10-0.40 each).

## Layout

```
plugins/lean/
  .claude-plugin/plugin.json   manifest
  .mcp.json                    MCP server (alwaysLoad)
  features.json                default features
  hooks/hooks.json             SessionStart (repo map) + UserPromptSubmit (context guard)
  hooks/experimental-hooks.json  opt-in per-tool hooks for the rejected features
  servers/                     MCP server (zero-dependency JSON-RPC) + outline parser
  scripts/                     hooks, repo map, compactor, data peek, read cache
  agents/scout.md              Haiku lookup agent
  skills/stats/SKILL.md        /lean:stats
  test/                        mechanism tests
bench/                         benchmark harness, tasks, fixture, analysis, results
```
