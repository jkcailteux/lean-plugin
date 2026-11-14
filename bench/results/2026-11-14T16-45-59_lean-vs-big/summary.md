# Benchmark 2026-11-14T16-45-59

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm after an unscored warm-up · arms: lean (repomap+batchedit+contextguard+writer+agent), big (repomap+batchedit+contextguard+writer+agent+bigread) · % change vs **lean**

## Each arm vs lean on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| big | f-symbol, f-bigq | 6/6 | +23% | +62% | +42% | +52% | +47% |

## Task: f-symbol

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.279 ±0.019 | 2.7 | 22 | 80,143 | 11,835 | 1,904 | 0.0 |
| big | 3/3 | 0.341 ±0.104 (+22%) | 5.3 (+100%) | 31 (+41%) | 140,374 (+75%) | 12,916 (+9%) | 2,718 (+43%) | 0.0 () |

## Task: f-bigq

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.260 ±0.015 | 4.3 | 14 | 123,338 | 13,117 | 713 | 0.0 |
| big | 3/3 | 0.325 ±0.055 (+25%) | 6.0 (+38%) | 21 (+43%) | 169,925 (+38%) | 15,586 (+19%) | 1,129 (+58%) | 0.0 () |

Total spend: $4.72 (warm-up $1.10)
