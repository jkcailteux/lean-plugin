# Privacy policy

Last updated: November 2, 2026

lean is a local plugin for Claude Code and Cursor. It collects no data about you.

- **No network calls.** The plugin contains no network code: no analytics, telemetry, crash reports, accounts or update checks.
- **What stays on your machine.** `~/.claude/lean/` holds a savings log (one line per lean tool call: tool name, sizes, round trips saved, project folder), per-session hook state and a repo-map cache. In Cursor, the repo map is also written to `.cursor/rules/lean-repo-map.mdc` in your project. Delete any of these at any time.
- **What it reads.** Your repository's file list and top-level symbols (for the repo map), files and commands that your agent asks its tools to read or run, and, for usage stats, the transcripts Claude Code already keeps in `~/.claude/projects/`. None of it leaves your machine through lean.
- **Your AI provider.** Tool results go into your agent's conversation like any other tool's output, so they reach Anthropic or Cursor under those services' own privacy terms. lean adds nothing to that.

Questions: open an issue at https://github.com/jkcailteux/lean-plugin/issues.
