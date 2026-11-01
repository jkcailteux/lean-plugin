# Benchmark 2026-11-01T17-25-48

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm · arms: lean (no features), repomap (repomap) · % change vs **lean**

## All tasks (mean per session)

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| lean | 9/9 | 0.223 ±0.067 | 11.1 | 28 | 171,109 | 17,218 | 2,741 |
| repomap | 9/9 | 0.221 ±0.103 (-1%) | 11.0 (-1%) | 24 (-13%) | 179,111 (+5%) | 17,108 (-1%) | 2,581 (-6%) |

## Task: explore

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.172 ±0.029 | 4.3 | 18 | 166,183 | 14,362 | 1,350 |
| repomap | 3/3 | 0.139 ±0.019 (-20%) | 2.0 (-54%) | 14 (-24%) | 78,661 (-53%) | 13,183 (-8%) | 1,003 (-26%) |

## Task: trace

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.192 ±0.010 | 4.0 | 22 | 120,369 | 16,689 | 1,892 |
| repomap | 3/3 | 0.177 ±0.010 (-8%) | 4.0 (0%) | 18 (-17%) | 124,280 (+3%) | 15,136 (-9%) | 1,709 (-10%) |

## Task: edit

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| lean | 3/3 | 0.306 ±0.042 | 25.0 | 44 | 226,774 | 20,604 | 4,980 |
| repomap | 3/3 | 0.347 ±0.072 (+14%) | 27.0 (+8%) | 41 (-7%) | 334,391 (+47%) | 23,005 (+12%) | 5,032 (+1%) |

Total spend: $4.00
