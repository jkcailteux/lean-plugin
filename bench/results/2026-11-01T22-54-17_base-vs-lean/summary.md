# Benchmark 2026-11-01T22-54-17

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm · arms: base, lean · % change vs **base**

## Each arm vs base on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| lean | trace, f-data, f-grep | 9/9 | +8% | -31% | -24% | -12% | -26% |

## Task: trace

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.203 ±0.016 | 4.3 | 22 | 132,320 | 17,599 | 1,945 |
| lean | 3/3 | 0.249 ±0.134 (+23%) | 4.0 (-8%) | 18 (-16%) | 125,427 (-5%) | 24,353 (+38%) | 1,701 (-13%) |

## Task: f-data

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.143 ±0.026 | 9.7 | 22 | 215,035 | 9,302 | 1,394 |
| lean | 3/3 | 0.122 ±0.047 (-15%) | 5.3 (-45%) | 14 (-38%) | 178,594 (-17%) | 9,121 (-2%) | 748 (-46%) |

## Task: f-grep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.075 ±0.005 | 2.3 | 10 | 76,115 | 6,110 | 582 |
| lean | 3/3 | 0.082 ±0.003 (+11%) | 2.0 (-14%) | 9 (-11%) | 70,050 (-8%) | 7,561 (+24%) | 470 (-19%) |

Total spend: $2.62
