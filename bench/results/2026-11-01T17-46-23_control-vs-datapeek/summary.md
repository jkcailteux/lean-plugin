# Benchmark 2026-11-01T17-46-23

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 1 runs per task per arm · arms: control (repomap), datapeek (repomap+datapeek) · % change vs **control**

## Each arm vs control on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| datapeek | f-data | 1/1 | +12% | +33% | +222% | +34% | +25% |

## Task: f-data

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 1/1 | 0.110 ±0.000 | 3.0 | 7 | 104,414 | 10,248 | 457 |
| datapeek | 1/1 | 0.123 ±0.000 (+12%) | 4.0 (+33%) | 22 (+222%) | 140,095 (+34%) | 10,661 (+4%) | 573 (+25%) |

Total spend: $0.23
