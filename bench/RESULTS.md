# Feature ledger

Each candidate feature is benchmarked against the current accepted set. It joins `plugins/lean/features.json` only if it helps the tasks it targets without clearly hurting the others.

**Setup:** CommandConsole @ `424c734` (95 TS/TSX files), 3 tasks (explore, trace, edit) x 3 runs per arm. Vanilla isolation: `--setting-sources project,local` + `ENABLE_CLAUDEAI_MCP_SERVERS=false` (no user plugins, hooks or connectors). Raw data in `bench/results/`.

**Noise:** session cost varies about +/-10-25% run to run. With 3 runs, treat differences under about 10% as noise unless the transcripts (`bench/analyze.mjs`) show the mechanism.

| round | comparison | cost (all tasks) | where it moved | decision |
|---|---|---:|---|---|
| 0 | vanilla vs lean (no features) | +3% | nothing; lean's tools barely used, ~875 tokens of fixed prompt overhead | baseline |
| - | readcache | not run | 0 re-reads in 18 sessions, so nothing to save on this suite | **parked**: needs a long-session task |
| 1 | lean vs +repomap | -1% | explore -20% cost / -54% turns; trace -8% (skipped reading cache.ts); edit +14% (within noise) | **accepted** |
| 2 | repomap vs +outline tool | +5% | Outline never called in 9 sessions; differences are noise | rejected |
| 3 | repomap vs 8 candidates (81 sessions) | see REPORT.md | batchedit: edit turns -79%; slim: +10%; readcache/bigread/datapeek/bashcompact never fired; junkfilter -43% grep output on polluted repo only | **batchedit accepted** |
| 4 | vanilla vs lean (repomap+batchedit), 48 sessions | **-28%** | turns -47%, wall -28%, output -39%; 24/24 pass both arms | composite |
| 5 | vanilla vs final config (no per-call hooks, + contextguard), 32 sessions | **-18%** | turns -43%, wall -25%, output -34%; 16/16 pass; edit -31%, f-symbol -47% | confirmed |
| - | contextguard | simulated | -36% to -42% of real spend if /compact when warned (a block before the prompt: -38% to -45%); ships as a warning | **accepted** |

## Observations

- Grep output is the largest single cost (about 2.7k tokens per session on trace and edit).
- Vanilla explore spends about 3.2k tokens per session on `ls`/`find` through Bash; repomap removes it.
- Built-in Edit requires a prior built-in Read, so MultiRead can't replace reads before edits.
