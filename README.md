# lean: a token-lean Claude Code plugin

Every feature in this plugin was benchmarked against vanilla Claude Code and kept only if it measurably helped. See [REPORT.md](REPORT.md) for what was tried, what won, what lost, and by how much, or the [project site](https://jkcailteux.github.io/lean-plugin/) for the short version.

**Open source (MIT), free, no telemetry.** lean makes no network calls: no analytics, no phone-home, no account. Everything it stores stays on your machine in `~/.claude/lean/`.

## What you get (on by default)

| Feature | How it works | Measured effect |
|---|---|---|
| **Repo map** | SessionStart hook injects a ~1.3k-token map of the repo (files + top-level symbols as `name:line`), cached per git HEAD. | Exploration: -54% turns, -20% cost. Lookups: skips reading whole files to find symbols. |
| **BatchEdit** | MCP tool: many exact search/replace edits across files in one call, no prior Read needed, all-or-nothing per file. | Multi-file edits: -82% turns, -37% cost, -50% wall time. |
| **Context guard** | UserPromptSubmit hook. Resuming a 150k+ token session after the 1-hour prompt cache expired: a one-time warning suggesting `/compact` after that reply (the prompt is never held). Past 250k tokens: a one-time tip. | Simulated on real history: -36% to -42% of spend if you compact when warned. |
| **MultiRead** | MCP tool: several files or line ranges in one call. | Removing it raised cost 10% and exploration turns 4x. |
| **RunCompact** | MCP tool: runs tests/builds and returns only exit status, failures with context, and the tail. | A 320-test run: ~4k tokens down to ~300. |
| **UsageStats** + `/lean:stats` | This project's recent cost at API prices, per-tool output sizes, and what lean saved in tokens, round trips, dollars and model time (tool calls and guard-prompted `/compact`s). | Visibility only; savings are estimates. |
| **lean:scout** agent | Haiku read-only lookup agent returning `file:line` lists. | Not benchmarked (optional). |

Measured together against vanilla Claude Code (8 tasks, two independent runs, every task passing): **-18% to -28% cost, -43% to -47% turns, -25% to -28% wall time, -34% to -39% output tokens.**

How it was measured: Claude Opus 5.5 on Claude Code 2.1.301, plain Claude Code against Claude Code with lean. Every session ran with user plugins, hooks and connectors turned off. 3 tasks ran on a real Next.js app pinned to one commit and 5 on a generated repo built to exercise each feature, with every answer and edit checked automatically. Each arm got its own throwaway git clone, reset after every run; arms ran in parallel, with one unscored warm-up per repo. That's 80 sessions in the two main runs plus per-feature rounds, about $45 of API time. To run it yourself, see [Benchmark](#benchmark).

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

## Privacy: no telemetry

Full policy: [PRIVACY.md](PRIVACY.md). Support: [GitHub issues](https://github.com/jkcailteux/lean-plugin/issues).

- The plugin contains no network code. It never sends data anywhere.
- The only commands it runs on its own are local `git ls-files` and `git rev-parse` for the repo map. RunCompact runs the commands Claude asks it to, like any shell tool.
- Local files: `~/.claude/lean/` holds the savings log, per-session hook state, the repo-map cache and (in Cursor) recent workspace folder paths. Delete it any time.
- `/lean:stats` reads the transcripts Claude Code already keeps in `~/.claude/projects/` and prints the result in your session. Nothing leaves your machine.

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

## Install in Cursor

The same plugin folder carries a Cursor manifest (`.cursor-plugin/plugin.json`) next to the Claude one, sharing the MCP server and repo-map code.

**Try it locally:** copy the plugin into Cursor's local plugins folder. Cursor rejects a symlink that points outside that folder, and picks up the copy without a restart.

```bash
rsync -a --exclude test /path/to/lean-plugin/plugins/lean/ ~/.cursor/plugins/local/lean/
```

The repo map needs Cursor's plugin hooks, and the Cursor app runs those only while **Include Third-Party Plugins, Skills, and Other Configs** is on (Cursor Settings). With it off the tools still load but the repo map is never written.

With that setting on, Cursor also imports lean from Claude Code if it is installed there (it shows as "Imported", and `loadClaudePlugin lean@lean-marketplace` appears in its logs). Both copies serve the same tools under the same `plugin-lean-tools` id, and both give UsageStats its Cursor report (the server recognizes the Cursor app from its environment).

**Cursor CLI:** `cursor-agent --plugin-dir /path/to/lean-plugin/plugins/lean` loads it for one run. Cursor asks before every MCP tool call, and in print mode (`-p`) it rejects them unless they are allowed. Allow the tools in a project's `.cursor/cli.json` (RunCompact runs shell commands, so add it only if you would allow those):

```json
{ "permissions": { "allow": ["Mcp(plugin-lean-tools:BatchEdit)", "Mcp(plugin-lean-tools:MultiRead)"] } }
```

**Share it:** the repo root has a Cursor marketplace file (`.cursor-plugin/marketplace.json`) listing the same plugin.

What you get in Cursor:

| Feature | Cursor |
|---|---|
| MultiRead, BatchEdit, RunCompact | Same MCP server, same tools |
| Repo map | Written to `.cursor/rules/lean-repo-map.mdc` as an always-applied rule on workspace open and session start, and added to `.git/info/exclude` so it never shows in `git status` |
| Tool nudges | `cursor/rules/lean.mdc`, always applied |
| scout agent | `cursor/agents/scout.md`, on Cursor's fast model, read-only |
| UsageStats | Ask the agent what lean saved: tokens kept out of context and round trips saved, per tool, for this project (`allProjects` for all), from lean's local savings log. When this project's Cursor transcripts are on disk, the skipped round trips are also a share of the model calls that ran. Prompt times are stored to the minute, so that share is a call ratio, not wall-clock time. No spend or dollars: Cursor doesn't share token counts, so see Usage in the Cursor dashboard. The repo map's effect isn't counted |
| Context guard, `/lean:stats` | Not available: they read Claude Code transcripts |

The Cursor app starts MCP servers in `/`, so the server asks Cursor for the workspace folder (MCP roots) and resolves relative paths and the per-project stats against it. If Cursor returns none, it uses the newest workspace the Cursor hook recorded in `~/.claude/lean/cursor-roots.json`. If it still has no project folder, relative paths fail with a message saying so; RunCompact also takes a `cwd`.

The Cursor port is not benchmarked yet: every measured saving in this README comes from Claude Code.

## Configure

- `plugins/lean/features.json`: the default feature list.
- `LEAN_FEATURES=repomap,batchedit,junkfilter claude`: override for one session (comma or `+` separated; empty string turns everything optional off).
- `.claude/lean-notes.md` in a project: injected into every session there.
- Context guard thresholds: `LEAN_GUARD_IDLE_MIN` (default 58), `LEAN_GUARD_MIN_CTX` (150000), `LEAN_GUARD_LARGE_CTX` (250000).
- Files live in `~/.claude/lean/` (savings log, hook state, repo-map cache, Cursor workspace list). Delete the folder any time. In Claude Code usage stats come from its own transcripts; the savings log holds one line per lean tool call (tool, sizes, round trips saved, project folder). The Cursor report reads that log, and counts model calls from the transcripts Cursor already keeps in `~/.cursor/projects/`.
- `/lean:stats` (or "show lean stats for the last 72h") prices each turn from the transcript's token counts at API list prices, then credits lean with: output each tool kept out of context (one cache write plus a re-read on every later turn until compaction), each round trip saved (at that session's average turn cost and the median turn time), and each context-guard warning that was followed by `/compact`. Not counted: the repo map's shorter exploration, which only the benchmark measures. On a subscription, read the dollars as usage-limit headroom.

Default hooks run once per session (SessionStart) and once per prompt (UserPromptSubmit), never per tool call. They never grant permissions or hold a prompt. (The opt-in experimental hooks can deny a tool call; each denial says how to go ahead anyway.)

## Test

```bash
node --test plugins/lean/test/*.test.mjs
```

40 mechanism tests: every hook and tool runs as a real subprocess with the JSON Claude Code (or Cursor) sends, against a generated fixture repo. `regression.test.mjs` covers what broke on a large Gradle/Kotlin repo, tested for any stack: stack traces that open in framework code, `./gradlew` and `./mvnw`, Java/Kotlin/Swift/C# symbols, the oversized-repo map, and a missing project folder.

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
  .cursor-plugin/plugin.json   Cursor manifest (points at cursor/)
  cursor/                      Cursor MCP config, hooks, rules, scout agent
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

## License

[MIT](LICENSE). Free to use, modify and redistribute.
