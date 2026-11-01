---
name: stats
description: Show what recent Claude Code sessions in this project cost, which tools produced the most output (context/tokens), and how many tokens, dollars and seconds lean saved. Use when asked about token usage, cost, time saved, tool usage, or what is eating context.
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_SKILL_DIR}/../../scripts/stats.mjs" $ARGUMENTS`

The report above is already computed (the number after /lean:stats, if any, is the window in hours). Answer in this one reply without calling any tool. If the report is missing, call `mcp__plugin_lean_tools__UsageStats` instead (pass `sinceHours` if the user named a window).

Show the spend line and both tables as they are. Then, in at most four short lines:
- The "What lean saved" table is an estimate and $ are API list prices (usage-limit headroom on a subscription); `node bench/bench.mjs` gives a measured comparison.
- Name the one or two tools with the largest share and one concrete trim for each, e.g. long test/build output → `RunCompact`; large file reads → `MultiRead` with `start`/`end`; many small lookups → the `lean:scout` agent.
