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
| 6 | lean vs +writer hint, f-gen only (write 160 tests), 2 x 9 sessions | **-71%** | second run, with Agent disallowed in the control arm: $1.11 (0/3 delegated) against $0.32 with the hint (3/3 delegated, sd $0.018) and $0.64 with Agent allowed but no hint (2/3 delegated, sd $0.41). Main-model output 11.7k tokens down to 1.6k, wall -21%, Haiku's share $0.014-0.019. 18/18 pass, all 160 thresholds right. The first run showed only -35% because its control arm could still spawn the agent and did so 1/3 times; by behaviour it agreed ($0.44 delegated, $1.11 not) | **opt-in**: `writer` stays out of features.json until the full suite shows the hint does not cause delegation where it costs more |
| 7 | lean vs +writer hint, all 11 tasks (adds f-bigq: question over a 1,967-line file; f-neg: small edit that must not delegate), Agent allowed in both arms, 66 sessions, $21.40 | **-21%** | f-gen -70% ($1.16 to $0.35, 3/3 delegated against 0/3, wall -24%); the other 10 tasks spawned no subagent in either arm and moved -8% to +13%, all inside run-to-run spread (largest: f-bigq $0.29 ±0.03 to $0.33 ±0.08). f-neg $0.175 against $0.177. 33/33 pass both arms. lean:scout was never called on f-bigq, so its question mode is untested | **writer accepted** |
| 8 | lean vs +bigread (outline instead of a full read or bare cat of a 300+ line file, pointing to a range read or lean:scout), f-bigq and f-symbol, experimental hooks wired in for the run, 12 sessions, $4.72 | **+23%** | f-bigq +25% ($0.26 to $0.33), f-symbol +22% ($0.28 to $0.34, one run took 10 turns against 3); turns +62%, wall +42%. The session logs show the guard never fired: 0 outline denials in all 7 guarded sessions (warm-up included), because Claude never attempted a full read or bare cat of the big file in either arm; it used Grep and range reads. So lean:scout was never suggested and was spawned 0 times, and the cost gap is not caused by the guard: it comes from run-to-run differences in approach (extra Grep rounds, Bash attempts the task does not allow), and f-bigq already ranged $0.29 to $0.33 between two guard-free arms in row 7. 6/6 pass both arms | **rejected** as no measurable benefit: bigread stays off, scout question mode stays untested because nothing triggers it |
| 9 | lean vs +scouthint (session-start tip: for a question about a 300+ line file you do not need to edit, give lean:scout the path and the question), f-bigq and f-symbol, 12 sessions, $3.74 | **-13%** | f-bigq -21% ($0.289 to $0.227), turns 5.0 to 2.7, main-model input tokens -44%; lean:scout spawned in 3/3 hinted runs (Haiku share $0.004 to $0.007 each) and 0/3 without the hint. Wall time +169% on f-bigq (18 s to 48 s): the subagent is slower than three or four greps. f-symbol (explain a function, cite lines) did not delegate and stayed flat (-5%). 6/6 pass both arms | **not shipped**: the flag was removed from the plugin; 6 cents saved for 30 s of extra wall time was not worth carrying an untested switch |

## Observations

- Grep output is the largest single cost (about 2.7k tokens per session on trace and edit).
- Vanilla explore spends about 3.2k tokens per session on `ls`/`find` through Bash; repomap removes it.
- Built-in Edit requires a prior built-in Read, so MultiRead can't replace reads before edits.
