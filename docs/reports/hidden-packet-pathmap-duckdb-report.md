# Hidden Packet Pathmap DuckDB Report

Generated: 2026-06-05T14:57:51.611Z
Mode: WRITE

## Summary
- input rows: 6353
- normalized rows: 6353
- duckdb rows: 6353
- joins with sourceRef + feature_id: 6353
- stable-id joins: 6353
- sourceRef joins: 6353
- missing-feature todos with todo sourceRef: 135

## Inputs
| key | selected | rows | fallback |
|---|---|---:|---|
| feature_labels | .tmp/feature_labels.jsonl | 3106 | false |
| kanban_tasks | .tmp/kanban_tasks.jsonl | 3106 | false |
| missing_feature_todos | sveltekit-frontend/.tmp/missing_feature_todos.jsonl | 141 | true |

## Top Buckets
| bucket | rows |
|---|---:|
| src/ | 4696 |
| src/lib/server/db/schema/ | 1426 |
| todo | 135 |
| drizzle/manual/ | 48 |
| lib | 36 |
| routes | 8 |
| .opencode/ | 2 |
| docs/graph/ | 1 |
| scripts/atlas/ | 1 |

## Notes
- This materialization turns hidden packet JSONL surfaces into a queryable DuckDB join table.
- The canonical join spine remains sourceRef + feature_id, with stable_id available for task and packet reconciliation.
- The DuckDB table is an offline artifact; it does not mutate Postgres, Qdrant, Redis, or Neo4j.
