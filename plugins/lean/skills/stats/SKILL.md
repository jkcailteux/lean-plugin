---
name: stats
description: Show what recent Claude Code sessions in this project cost, which tools produced the most output (context/tokens), and how many tokens, dollars and seconds lean saved. Use when asked about token usage, cost, time saved, tool usage, or what is eating context.
---

Call `mcp__plugin_lean_tools__UsageStats`. It covers the last 24 hours by default; pass `sinceHours` if the user names another window.

Show the spend line and the tables it returns. The "What lean saved" table is an estimate (tool calls compared with the built-in tool doing the same job, and context-guard warnings the user followed with /compact); say so, say that dollars are API list prices (usage-limit headroom on a subscription), and point to `bench/bench.mjs` (see README "Benchmark") for a measured comparison. Then name the one or two tools with the largest share and suggest a concrete way to trim each one, for example:

- Long test or build output: use `RunCompact` instead of Bash.
- Large file reads: use `MultiRead` with `start`/`end` line ranges.
- Many small lookups: delegate them to the `lean:scout` agent.
