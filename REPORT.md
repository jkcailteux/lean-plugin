# lean: what we tried, what worked, and what to expect

## Bottom line

| Scope | Change in spend | How we know |
|---|---:|---|
| **The plugin, on task-sized sessions** | **-18% to -28%** (turns -43% to -47%, wall time -25% to -28%, output tokens -34% to -39%) | Measured twice against vanilla Claude Code on 8 tasks: 48 sessions (-28%) and a confirmation run of the final config, 32 sessions (-18%). Every task passed in every arm |
| **The plugin + `autoCompactWindow: 200000`, on your real usage** | **about -50% to -60%** | Simulated: your 70 real sessions (8,158 turns) re-priced turn by turn, with a 30-60k token re-read penalty per compaction |

Consistent wins in both runs: multi-file edits (-31% to -37% cost, ~80% fewer turns), symbol lookups in big files (-47% to -60%), exploration (-50% turns). The one cost: on the tiniest tasks (a single grep, ~$0.08), lean's fixed overhead (repo map + tool definitions) adds about $0.01.

Why two numbers: benchmark tasks are short (2-30 turns), but your real sessions average **341k tokens of context per turn**, and turns above 120k context are **78% of your spend**. In that regime the dominant cost is re-reading the conversation every turn, so context policy (compact sooner, compact after idle) beats any tool-output trick. The plugin's tool savings still apply on top, and grow in long sessions because every saved turn skips a full-context re-read.

## What's in the plugin (accepted)

| Feature | Evidence | Expected gain |
|---|---|---|
| **Repo map** (SessionStart, ~1.3k tokens, `symbol:line`) | Round 1 vs lean: explore -20% cost / -54% turns, trace -8% (skipped reading `cache.ts`). Composite: explore -16%, f-symbol **-60%** | Exploration and "where is X" work: -15% to -60% per task |
| **BatchEdit** (MCP tool) | Big round: edit task turns 25 -> 5.3 (-79%), wall -39%. Composite: edit **-37% cost, -82% turns**, -50% wall. 0 failed calls in 9 uses | Multi-file edits: about -35% cost, -50% wall. In your history, back-to-back edits are 500 turns = up to **3.1% of spend** in context re-reads alone |
| **Context guard** (UserPromptSubmit) | Mechanism: 3 unit tests + live test (blocks once with 0 turns, second send goes through). Value: simulated on your history | **-38% to -45%** of spend *if you /compact when prompted* (20-25 idle resumes of huge contexts in your history) |
| **MultiRead, RunCompact** (core tools) | Removing them ("slim") cost +10% and quadrupled exploration turns. RunCompact turns a 320-test run from ~4k tokens to ~300 | Keeps reads batched and test output small |
| **Recommended setting** `autoCompactWindow: 200000` (not a plugin feature) | Simulated: 400k -36% to -43%, 300k -44% to -53%, **200k -50% to -60%**, 150k barely better than 200k but 2x the compactions | The single biggest lever. Trade-off: compaction loses older detail |

## Tried and rejected

| Idea | Test | Result | Why rejected |
|---|---|---|---|
| Read cache (skip unchanged re-reads) | 4 unit tests pass; benchmark with a multi-step edit/test task; your history | **0 identical re-reads in 615 real Reads**; 0 hook firings in 9 benchmark sessions | Claude Code already doesn't re-read. Nothing to save |
| Outline tool | Round 2 benchmark | Claude **never called it** in 9 sessions | Tools Claude has to choose go unused |
| Big-file outline via Read hook + ReadSymbol | 2 unit tests; 12 benchmark sessions incl. a 1,967-line file | Never fired; ReadSymbol never called | Repo map's line numbers already make Claude read ranges |
| Data-file summaries (JSON/CSV/log) | 3 unit tests (summary contains the exact answers); targeted task | Claude never Reads big data files; it uses jq/grep (~110 tokens). History: 0 big data reads | No opportunity |
| Grep junk filter (lockfiles, minified, dist) | 2 unit tests incl. real ripgrep; polluted-repo task | Works: grep output -43% on that task; ~140 tokens per grep | 0.04% of your real tool output, and it could hide real code in `build/` folders |
| Bash test/build compaction hook | 2 unit tests (exit code kept, output 4x smaller) | 0% change | Redundant: Claude already uses RunCompact |
| Removing the core tools ("slim") | 3 tasks x 3 runs | +10% cost, explore turns 2 -> 7.7 | Core tools earn their ~600 tokens |
| Stable vs timestamped session context | 2 tasks x 3 runs | No measurable cache effect | SessionStart text isn't in the shared cache prefix |
| Faster search / in-memory index | History: tool execution time | Tools are **0.4% of wall time** | Model time dominates; not built |
| Write -> Edit guard | History | 14 full rewrites = 49k output tokens total | Too small |
| Dedupe identical tool calls | History | 816 repeats, ~665 tokens total | Too small |
| Parallelize single-read turns | History | 8 occurrences | Too small |

## Efficiency review of what we kept

- **No per-tool-call hooks.** The first version ran two node hooks on every tool call (~55 ms each, ~8 minutes across your history's 8,651 calls) for features that turned out not to help. Default hooks now run once per session and once per prompt. The experimental hooks moved to an opt-in file.
- **UsageStats reads Claude Code's own transcripts** instead of logging every call through a hook: zero overhead, and exact. It also prices every turn at API list prices and turns lean's savings into dollars and model time (matched per tool call; guard blocks are credited only when a `/compact` follows). The repo map's effect is not visible per session and is left to the benchmark.
- **Repo map** is cached per git HEAD (45 ms to build, instant after), needs no trimming (asset files are only 2.6% of it), and is **not re-injected on resume** (it's already in the transcript).
- **BatchEdit** returns one line ("N of M edits applied") and is all-or-nothing per file; 0 failures observed.
- **Context guard** reads only the last 4 MB of the transcript, so it stays fast on huge sessions, and never fires twice for the same idle gap.
- Tests guard these choices: `default hooks never run per tool call` and `nothing is re-injected on resume` are part of the 24-test suite.

## Outside the plugin: your setup

Found while mining your history; not lean's job, but real money:

- **claude-mem's observer sessions are 6.5% of your spend** (223 background sessions, 82% of their cost is cache writes). It also injects ~3.1k tokens at every session start.
- Plugin injections that land in context: Vercel ~1k tokens per session, caveman ~300 per session plus a line per prompt, WozCode reminders after Bash calls.
- **Idle resumes**: 72 turns in your history re-wrote 33M tokens after the cache expired. Context guard targets exactly this.

## Method and caveats

- **Isolation:** every benchmark session ran with `--setting-sources project,local` and `ENABLE_CLAUDEAI_MCP_SERVERS=false`, so no user plugins (WozCode, RTK, caveman, Vercel, claude-mem), hooks or connectors. Each arm worked in its own throwaway git clone, reset after every run; arms ran in parallel.
- **Tasks:** 3 on a real Next.js repo (CommandConsole @ `424c734`) and 5 on a generated fixture built to trigger each feature (`bench/fixture.mjs`). Edits and answers are checked automatically.
- **Noise:** with 3 runs, single-task cost swings of 10-50% happen by chance. Features were judged by whether their mechanism actually fired (from transcripts, `bench/analyze.mjs`) and by cost, not by cost alone.
- **Simulation:** relative prices input 1, cache write 2 (1h), cache read 0.1, output 5. A compaction costs a full uncached read, 4k output tokens, and 30-60k tokens of re-reads. It cannot price lost detail after compaction.
- **Model:** Claude Opus 5.5, Claude Code 2.1.301. Total benchmark spend: about $45.

## Install

See [README.md](README.md#install-in-claude-code). Short version, inside Claude Code:

```
/plugin marketplace add /path/to/lean-plugin
/plugin install lean@lean-marketplace
```

Then add `{ "autoCompactWindow": 200000 }` to `~/.claude/settings.json`.
