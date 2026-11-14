# Benchmark 2026-11-14T16-23-32

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm after an unscored warm-up · arms: lean (repomap+batchedit+contextguard+agent), cand (repomap+batchedit+contextguard+agent+writer) · % change vs **lean**

## Each arm vs lean on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| cand | explore, trace, edit, f-tests, f-data, f-symbol, f-grep, f-multistep, f-gen, f-bigq, f-neg | 33/33 | -21% | +6% | -9% | -6% | -44% |

## Task: explore

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.332 ±0.020 | 2.0 | 15 | 89,770 | 17,278 | 1,022 | 0.0 |
| cand | 3/3 | 0.345 ±0.029 (+4%) | 2.0 (0%) | 15 (+0%) | 90,580 (+1%) | 17,983 (+4%) | 1,064 (+4%) | 0.0 () |

## Task: trace

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.315 ±0.023 | 3.0 | 19 | 87,197 | 14,724 | 1,633 | 0.0 |
| cand | 3/3 | 0.317 ±0.017 (+0%) | 3.0 (0%) | 19 (-0%) | 87,342 (+0%) | 14,764 (+0%) | 1,646 (+1%) | 0.0 () |

## Task: edit

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.385 ±0.044 | 4.7 | 26 | 169,899 | 16,943 | 2,082 | 0.0 |
| cand | 3/3 | 0.367 ±0.036 (-5%) | 4.3 (-7%) | 26 (-1%) | 150,384 (-11%) | 15,869 (-6%) | 2,153 (+3%) | 0.0 () |

## Task: f-tests

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.192 ±0.001 | 5.0 | 14 | 142,185 | 9,171 | 454 | 0.0 |
| cand | 3/3 | 0.193 ±0.001 (+1%) | 5.0 (0%) | 14 (-1%) | 142,571 (+0%) | 9,276 (+1%) | 454 (-0%) | 0.0 () |

## Task: f-data

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.169 ±0.026 | 3.0 | 12 | 114,846 | 8,189 | 420 | 0.0 |
| cand | 3/3 | 0.156 ±0.006 (-8%) | 2.0 (-33%) | 8 (-30%) | 76,492 (-33%) | 8,165 (-0%) | 283 (-33%) | 0.0 () |

## Task: f-symbol

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.294 ±0.006 | 3.0 | 25 | 80,297 | 12,098 | 2,177 | 0.0 |
| cand | 3/3 | 0.303 ±0.032 (+3%) | 4.3 (+44%) | 28 (+11%) | 107,630 (+34%) | 11,839 (-2%) | 2,360 (+8%) | 0.0 () |

## Task: f-grep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.155 ±0.005 | 2.0 | 9 | 76,017 | 7,850 | 386 | 0.0 |
| cand | 3/3 | 0.158 ±0.006 (+2%) | 2.0 (0%) | 9 (+0%) | 76,225 (+0%) | 7,954 (+1%) | 420 (+9%) | 0.0 () |

## Task: f-multistep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.253 ±0.008 | 11.0 | 18 | 119,864 | 11,339 | 1,255 | 0.0 |
| cand | 3/3 | 0.253 ±0.011 (-0%) | 11.0 (0%) | 18 (-2%) | 119,889 (+0%) | 11,303 (-0%) | 1,251 (-0%) | 0.0 () |

## Task: f-gen

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 1.158 ±0.046 | 4.0 | 93 | 222,712 | 40,248 | 11,942 | 0.0 |
| cand | 3/3 | 0.352 ±0.130 (-70%) | 6.3 (+58%) | 71 (-24%) | 138,458 (-38%) | 15,445 (-62%) | 1,578 (-87%) | 1.0 () |

## Task: f-bigq

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.290 ±0.032 | 5.7 | 18 | 151,534 | 13,961 | 980 | 0.0 |
| cand | 3/3 | 0.329 ±0.075 (+13%) | 6.0 (+6%) | 20 (+10%) | 185,656 (+23%) | 15,762 (+13%) | 1,059 (+8%) | 0.0 () |

## Task: f-neg

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok | subagents |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.175 ±0.001 | 3.0 | 12 | 115,346 | 8,249 | 531 | 0.0 |
| cand | 3/3 | 0.177 ±0.000 (+1%) | 3.0 (0%) | 12 (-2%) | 115,788 (+0%) | 8,417 (+2%) | 514 (-3%) | 0.0 () |

Total spend: $21.40 (warm-up $1.39)
