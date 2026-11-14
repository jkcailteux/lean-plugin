# Benchmark 2026-11-14T16-54-40

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm after an unscored warm-up · arms: lean (repomap+batchedit+contextguard+writer+agent), hint (repomap+batchedit+contextguard+writer+agent+scouthint) · % change vs **lean**

## Each arm vs lean on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| hint | f-symbol, f-bigq | 6/6 | -13% | -32% | +71% | -30% | -5% |

## Task: f-symbol

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.276 ±0.006 | 2.3 | 23 | 79,714 | 11,406 | 2,000 | 0.0 |
| hint | 3/3 | 0.263 ±0.003 (-5%) | 2.3 (0%) | 22 (-4%) | 79,366 (-0%) | 10,980 (-4%) | 1,842 (-8%) | 0.0 () |

## Task: f-bigq

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.289 ±0.024 | 5.0 | 18 | 166,703 | 13,890 | 905 | 0.0 |
| hint | 3/3 | 0.227 ±0.032 (-21%) | 2.7 (-47%) | 48 (+169%) | 92,535 (-44%) | 10,494 (-24%) | 919 (+2%) | 1.0 () |

Total spend: $3.74 (warm-up $0.57)
