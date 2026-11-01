# Benchmark 2026-11-01T18-10-07

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 2 runs per task per arm · arms: base, final · % change vs **base**

## Each arm vs base on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| final | explore, trace, edit, f-tests, f-data, f-symbol, f-grep, f-multistep | 16/16 | -18% | -43% | -25% | -15% | -34% |

## Task: explore

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 2/2 | 0.162 ±0.033 | 4.0 | 19 | 147,905 | 12,920 | 1,588 |
| final | 2/2 | 0.156 ±0.022 (-4%) | 2.0 (-50%) | 12 (-35%) | 80,533 (-46%) | 15,180 (+17%) | 1,071 (-33%) |

## Task: trace

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 2/2 | 0.193 ±0.013 | 4.0 | 19 | 117,471 | 16,912 | 1,861 |
| final | 2/2 | 0.182 ±0.010 (-5%) | 4.5 (+13%) | 25 (+30%) | 125,337 (+7%) | 15,645 (-7%) | 1,764 (-5%) |

## Task: edit

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 2/2 | 0.338 ±0.022 | 29.5 | 46 | 274,780 | 21,829 | 5,653 |
| final | 2/2 | 0.234 ±0.023 (-31%) | 6.0 (-80%) | 23 (-50%) | 240,491 (-12%) | 18,180 (-17%) | 2,212 (-61%) |

## Task: f-tests

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 2/2 | 0.119 ±0.014 | 6.0 | 16 | 167,812 | 9,007 | 739 |
| final | 2/2 | 0.118 ±0.013 (-0%) | 5.0 (-17%) | 12 (-25%) | 142,956 (-15%) | 10,135 (+13%) | 537 (-27%) |

## Task: f-data

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 2/2 | 0.124 ±0.017 | 9.0 | 13 | 185,062 | 8,184 | 1,176 |
| final | 2/2 | 0.131 ±0.001 (+5%) | 7.0 (-22%) | 15 (+16%) | 214,071 (+16%) | 8,860 (+8%) | 954 (-19%) |

## Task: f-symbol

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 2/2 | 0.335 ±0.215 | 8.5 | 35 | 303,446 | 27,519 | 2,989 |
| final | 2/2 | 0.176 ±0.008 (-47%) | 5.0 (-41%) | 26 (-27%) | 186,446 (-39%) | 11,364 (-59%) | 2,508 (-16%) |

## Task: f-grep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 2/2 | 0.072 ±0.003 | 2.0 | 12 | 65,070 | 6,124 | 558 |
| final | 2/2 | 0.084 ±0.003 (+17%) | 2.0 (0%) | 9 (-30%) | 69,965 (+8%) | 7,630 (+25%) | 518 (-7%) |

## Task: f-multistep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 2/2 | 0.184 ±0.000 | 11.0 | 29 | 250,497 | 11,277 | 2,311 |
| final | 2/2 | 0.164 ±0.013 (-11%) | 11.0 (0%) | 20 (-31%) | 225,050 (-10%) | 11,244 (-0%) | 1,575 (-32%) |

Total spend: $5.55
