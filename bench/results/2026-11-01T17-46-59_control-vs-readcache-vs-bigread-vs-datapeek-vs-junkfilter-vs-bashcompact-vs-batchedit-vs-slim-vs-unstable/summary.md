# Benchmark 2026-11-01T17-46-59

Repo `/Users/jethro/Documents/GitHub/CommandConsole` @ `424c734` · 3 runs per task per arm · arms: control (repomap), readcache (repomap+readcache), bigread (repomap+bigread), datapeek (repomap+datapeek), junkfilter (repomap+junkfilter), bashcompact (repomap+bashcompact), batchedit (repomap+batchedit), slim (repomap+slim), unstable (repomap+unstable) · % change vs **control**

## Each arm vs control on the same tasks (sum of per-task means)

| arm | tasks | pass | cost | turns | wall | input tok | output tok |
|---|---|---|---:|---:|---:|---:|---:|
| readcache | edit, f-tests, f-multistep | 9/9 | +9% | +17% | +16% | +17% | +13% |
| bigread | explore, trace, edit, f-symbol | 12/12 | +18% | +10% | +17% | +23% | +14% |
| datapeek | f-data | 3/3 | -19% | -52% | -34% | -34% | -51% |
| junkfilter | trace, f-grep | 6/6 | +2% | +5% | -1% | -6% | -0% |
| bashcompact | f-tests, f-multistep | 6/6 | +1% | 0% | +22% | +0% | +4% |
| batchedit | edit, f-multistep | 6/6 | -8% | -55% | -30% | -11% | -45% |
| slim | explore, trace, edit | 9/9 | +10% | +21% | +14% | +17% | +23% |
| unstable | trace, f-grep | 6/6 | -0% | -14% | +6% | -13% | -3% |

## Task: explore

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 3/3 | 0.146 ±0.018 | 2.0 | 16 | 79,563 | 14,083 | 1,015 |
| bigread | 3/3 | 0.224 ±0.121 (+53%) | 2.3 (+17%) | 13 (-19%) | 95,767 (+20%) | 23,349 (+66%) | 1,124 (+11%) |
| slim | 3/3 | 0.176 ±0.030 (+20%) | 7.7 (+283%) | 19 (+22%) | 119,101 (+50%) | 14,897 (+6%) | 1,786 (+76%) |

## Task: trace

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 3/3 | 0.190 ±0.015 | 5.0 | 21 | 153,136 | 15,642 | 1,882 |
| bigread | 3/3 | 0.181 ±0.008 (-5%) | 4.3 (-13%) | 20 (-1%) | 124,707 (-19%) | 15,270 (-2%) | 1,848 (-2%) |
| junkfilter | 3/3 | 0.192 ±0.026 (+1%) | 5.3 (+7%) | 23 (+11%) | 139,280 (-9%) | 16,190 (+4%) | 1,886 (+0%) |
| slim | 3/3 | 0.178 ±0.008 (-6%) | 4.3 (-13%) | 20 (-2%) | 122,132 (-20%) | 15,142 (-3%) | 1,784 (-5%) |
| unstable | 3/3 | 0.184 ±0.018 (-3%) | 4.0 (-20%) | 26 (+24%) | 124,403 (-19%) | 15,908 (+2%) | 1,772 (-6%) |

## Task: edit

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 3/3 | 0.329 ±0.036 | 25.0 | 44 | 241,881 | 23,215 | 4,995 |
| readcache | 3/3 | 0.374 ±0.088 (+14%) | 31.3 (+25%) | 46 (+6%) | 318,939 (+32%) | 24,773 (+7%) | 5,845 (+17%) |
| bigread | 3/3 | 0.407 ±0.099 (+24%) | 28.3 (+13%) | 65 (+49%) | 389,247 (+61%) | 25,452 (+10%) | 6,551 (+31%) |
| batchedit | 3/3 | 0.290 ±0.135 (-12%) | 5.3 (-79%) | 27 (-39%) | 187,325 (-23%) | 26,587 (+15%) | 2,248 (-55%) |
| slim | 3/3 | 0.377 ±0.104 (+14%) | 26.7 (+7%) | 52 (+18%) | 314,709 (+30%) | 24,468 (+5%) | 6,140 (+23%) |

## Task: f-tests

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 3/3 | 0.116 ±0.013 | 5.0 | 13 | 141,722 | 9,694 | 580 |
| readcache | 3/3 | 0.120 ±0.011 (+4%) | 5.3 (+7%) | 16 (+26%) | 154,066 (+9%) | 9,862 (+2%) | 615 (+6%) |
| bashcompact | 3/3 | 0.116 ±0.012 (+0%) | 5.0 (0%) | 13 (-1%) | 141,774 (+0%) | 9,714 (+0%) | 595 (+3%) |

## Task: f-data

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 3/3 | 0.122 ±0.029 | 7.0 | 18 | 177,399 | 8,678 | 951 |
| datapeek | 3/3 | 0.099 ±0.019 (-19%) | 3.3 (-52%) | 12 (-34%) | 116,436 (-34%) | 8,574 (-1%) | 465 (-51%) |

## Task: f-symbol

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 3/3 | 0.175 ±0.019 | 5.0 | 33 | 161,295 | 11,444 | 2,651 |
| bigread | 3/3 | 0.179 ±0.010 (+2%) | 5.7 (+13%) | 33 (+2%) | 173,375 (+7%) | 12,108 (+6%) | 2,478 (-7%) |

## Task: f-grep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 3/3 | 0.082 ±0.003 | 2.0 | 12 | 69,308 | 7,484 | 511 |
| junkfilter | 3/3 | 0.086 ±0.012 (+4%) | 2.0 (0%) | 9 (-21%) | 69,101 (-0%) | 7,981 (+7%) | 496 (-3%) |
| unstable | 3/3 | 0.088 ±0.011 (+6%) | 2.0 (0%) | 9 (-26%) | 69,210 (-0%) | 8,076 (+8%) | 542 (+6%) |

## Task: f-multistep

| arm | pass | cost $ | turns | wall s | input tok | cache write tok | output tok |
|---|---|---:|---:|---:|---:|---:|---:|
| control | 3/3 | 0.167 ±0.003 | 11.0 | 18 | 223,705 | 11,308 | 1,684 |
| readcache | 3/3 | 0.174 ±0.011 (+5%) | 11.3 (+3%) | 25 (+34%) | 237,921 (+6%) | 11,810 (+4%) | 1,735 (+3%) |
| bashcompact | 3/3 | 0.170 ±0.005 (+2%) | 11.0 (0%) | 25 (+39%) | 224,081 (+0%) | 11,543 (+2%) | 1,758 (+4%) |
| batchedit | 3/3 | 0.166 ±0.015 (-1%) | 11.0 (0%) | 17 (-8%) | 224,862 (+1%) | 11,807 (+4%) | 1,436 (-15%) |

Total spend: $15.33
