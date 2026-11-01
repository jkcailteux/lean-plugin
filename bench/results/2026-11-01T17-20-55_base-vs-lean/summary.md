# Benchmark 2026-11-01T17-20-55

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm · arms: base, lean · % change vs **base**

## All tasks (mean per session)

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 9/9 | 0.213 ±0.059 | 10.2 | 27 | 170,562 | 16,104 | 2,661 |
| lean | 9/9 | 0.220 ±0.054 (+3%) | 10.7 (+4%) | 27 (-0%) | 188,758 (+11%) | 16,639 (+3%) | 2,611 (-2%) |

## Task: explore

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.169 ±0.029 | 4.3 | 19 | 162,683 | 13,246 | 1,660 |
| lean | 3/3 | 0.184 ±0.031 (+9%) | 5.3 (+23%) | 22 (+17%) | 181,661 (+12%) | 14,921 (+13%) | 1,553 (-6%) |

## Task: trace

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.191 ±0.010 | 4.3 | 21 | 117,992 | 16,716 | 1,842 |
| lean | 3/3 | 0.198 ±0.017 (+4%) | 4.3 (0%) | 22 (+7%) | 134,883 (+14%) | 16,873 (+1%) | 1,993 (+8%) |

## Task: edit

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.279 ±0.055 | 22.0 | 42 | 231,011 | 18,351 | 4,481 |
| lean | 3/3 | 0.277 ±0.053 (-1%) | 22.3 (+2%) | 37 (-11%) | 249,730 (+8%) | 18,124 (-1%) | 4,288 (-4%) |

Total spend: $3.90
