# Cache Probe Analysis

- Run ID: `3783fdb6-1cbc-46d5-9e96-b9958755eb6f`
- Context hash: `45f8097d56599809fb4fddac015e961d8b6b7405029b5b2521369dca57bb4e14`
- Context chars: 6393
- Iterations: 10
- Rows analyzed: 240
- Rows written to Postgres: 0

## Layer Summary

| Layer | Rows | Success | Failures | Cache hits | Cache misses | p50 total ms | p95 total ms | p99 total ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| llama.cpp_direct | 60 | 60 | 0 | 0 | 0 | 1427 | 1555 | 2793 |
| opencode_adapter | 60 | 0 | 60 | 0 | 0 | n/a | n/a | n/a |
| bitfrost_exact | 60 | 0 | 60 | 0 | 60 | n/a | n/a | n/a |
| bitfrost_semantic | 60 | 0 | 60 | 0 | 60 | n/a | n/a | n/a |

## Case Summary

| Case | Rows | Direct prompt_eval ms | Adapter prompt_eval ms | Exact hit rate | Semantic hit rate |
|---|---:|---:|---:|---:|---:|
| A1 | 40 | 0 | n/a | 0% | 0% |
| B1 | 40 | 0 | n/a | 0% | 0% |
| A2 | 40 | 0 | n/a | 0% | 0% |
| C1 | 40 | 0 | n/a | 0% | 0% |
| D1 | 40 | 0 | n/a | 0% | 0% |
| E1 | 40 | 0 | n/a | 0% | 0% |

## Notes

- Treat prompt-eval timing as the primary cache signal.
- Keep warm-up and measured runs separated when interpreting the report.
- Ten samples are enough for directional validation, not for strong p99 claims.
- Exact and semantic caches should be evaluated independently.
