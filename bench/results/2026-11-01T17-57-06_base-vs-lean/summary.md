# Benchmark 2026-11-01T17-57-06

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm · arms: base, lean · % change vs **base**

## Each arm vs base on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| lean | explore, trace, edit, f-tests, f-data, f-symbol, f-grep, f-multistep | 24/24 | -28% | -47% | -28% | -30% | -39% |

## Task: explore

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.183 ±0.042 | 5.3 | 22 | 187,293 | 13,844 | 1,864 |
| lean | 3/3 | 0.154 ±0.018 (-16%) | 2.3 (-56%) | 14 (-37%) | 80,923 (-57%) | 14,827 (+7%) | 1,117 (-40%) |

## Task: trace

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.197 ±0.013 | 4.7 | 23 | 118,375 | 17,321 | 1,920 |
| lean | 3/3 | 0.184 ±0.016 (-6%) | 4.3 (-7%) | 21 (-8%) | 139,661 (+18%) | 15,049 (-13%) | 1,953 (+2%) |

## Task: edit

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.346 ±0.018 | 29.3 | 55 | 266,614 | 21,951 | 6,066 |
| lean | 3/3 | 0.218 ±0.013 (-37%) | 5.3 (-82%) | 28 (-50%) | 186,402 (-30%) | 17,330 (-21%) | 2,259 (-63%) |

## Task: f-tests

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.119 ±0.010 | 6.3 | 17 | 179,358 | 8,650 | 785 |
| lean | 3/3 | 0.120 ±0.022 (+1%) | 5.3 (-16%) | 11 (-34%) | 155,424 (-13%) | 9,863 (+14%) | 584 (-26%) |

## Task: f-data

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.138 ±0.029 | 8.7 | 13 | 194,029 | 9,662 | 1,175 |
| lean | 3/3 | 0.109 ±0.012 (-21%) | 5.0 (-42%) | 18 (+32%) | 153,567 (-21%) | 8,273 (-14%) | 685 (-42%) |

## Task: f-symbol

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.432 ±0.096 | 8.3 | 39 | 387,756 | 36,744 | 3,375 |
| lean | 3/3 | 0.171 ±0.026 (-60%) | 4.7 (-44%) | 31 (-21%) | 149,802 (-61%) | 11,641 (-68%) | 2,496 (-26%) |

## Task: f-grep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.079 ±0.009 | 2.7 | 13 | 87,191 | 6,226 | 629 |
| lean | 3/3 | 0.087 ±0.010 (+11%) | 2.3 (-12%) | 11 (-16%) | 81,828 (-6%) | 7,615 (+22%) | 560 (-11%) |

## Task: f-multistep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| base | 3/3 | 0.190 ±0.012 | 11.3 | 27 | 264,240 | 11,479 | 2,401 |
| lean | 3/3 | 0.165 ±0.011 (-13%) | 11.3 (0%) | 18 (-35%) | 238,314 (-10%) | 11,274 (-2%) | 1,467 (-39%) |

Total spend: $8.67
