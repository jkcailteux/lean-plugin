# Benchmark 2026-11-01T17-30-54

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm · arms: repomap (repomap), outline (repomap+outline) · % change vs **repomap**

## All tasks (mean per session)

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| repomap | 9/9 | 0.234 ±0.115 | 11.0 | 27 | 176,522 | 18,040 | 2,895 |
| outline | 9/9 | 0.246 ±0.092 (+5%) | 9.7 (-12%) | 26 (-5%) | 168,402 (-5%) | 20,617 (+14%) | 2,554 (-12%) |

## Task: explore

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| repomap | 3/3 | 0.149 ±0.018 | 2.3 | 14 | 93,352 | 13,927 | 1,093 |
| outline | 3/3 | 0.228 ±0.134 (+53%) | 2.7 (+14%) | 16 (+15%) | 109,169 (+17%) | 23,526 (+69%) | 1,131 (+3%) |

## Task: trace

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| repomap | 3/3 | 0.180 ±0.013 | 4.3 | 19 | 124,392 | 15,348 | 1,780 |
| outline | 3/3 | 0.185 ±0.017 (+3%) | 4.3 (0%) | 22 (+18%) | 137,891 (+11%) | 15,269 (-1%) | 1,916 (+8%) |

## Task: edit

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| repomap | 3/3 | 0.372 ±0.093 | 26.3 | 48 | 311,824 | 24,845 | 5,812 |
| outline | 3/3 | 0.324 ±0.018 (-13%) | 22.0 (-16%) | 39 (-19%) | 258,146 (-17%) | 23,055 (-7%) | 4,614 (-21%) |

Total spend: $4.32
