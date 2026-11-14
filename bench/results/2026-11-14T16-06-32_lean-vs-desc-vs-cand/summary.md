# Benchmark 2026-11-14T16-06-32

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm after an unscored warm-up · arms: lean, desc (repomap+batchedit+contextguard+agent), cand (repomap+batchedit+contextguard+agent+writer) · % change vs **lean**

## Each arm vs lean on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| desc | f-gen | 3/3 | -43% | +8% | -9% | -18% | -57% |
| cand | f-gen | 3/3 | -71% | +8% | -21% | -35% | -87% |

## Task: f-gen

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 1.112 ±0.034 | 4.3 | 91 | 209,547 | 38,085 | 11,699 |
| desc | 3/3 | 0.637 ±0.408 (-43%) | 4.7 (+8%) | 84 (-9%) | 171,557 (-18%) | 24,803 (-35%) | 4,977 (-57%) |
| cand | 3/3 | 0.323 ±0.018 (-71%) | 4.7 (+8%) | 72 (-21%) | 136,453 (-35%) | 13,656 (-64%) | 1,572 (-87%) |

Total spend: $9.47 (warm-up $3.25)
