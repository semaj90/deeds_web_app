# Hidden Packet Pathmap Audit

Generated: 2026-06-05T14:53:21.352Z

## Summary

- Inputs requested: 3
- Inputs resolved: 3/3
- Total rows: 6353
- Invalid JSON rows: 0
- Rows with sourceRef/path: 6353
- Rows with feature_id/feature: 6353
- Rows with both sourceRef and feature_id: 6353

## Inputs

| key | requested | selected | rows | sourceRefs | featureIds | invalidJson | fallback |
|---|---|---|---:|---:|---:|---:|---|
| feature_labels | .tmp/feature_labels.jsonl | .tmp/feature_labels.jsonl | 3106 | 3106 | 3106 | 0 | false |
| kanban_tasks | .tmp/kanban_tasks.jsonl | .tmp/kanban_tasks.jsonl | 3106 | 3106 | 3106 | 0 | false |
| missing_feature_todos | .tmp/missing_feature_todos.jsonl | sveltekit-frontend/.tmp/missing_feature_todos.jsonl | 141 | 141 | 141 | 0 | true |

## Join Checks

- Kanban rows matched to feature labels by stable id: 3106/3106
- Kanban rows matched to feature labels by sourceRef + feature: 3106/3106
- Missing-feature todo rows with todo: sourceRef: 135/141

## Pathmap Contract

- Pathmap: docs/graph/missing-features-path-map.json
- Roots: sveltekit-frontend/src/lib/server/db/schema/, sveltekit-frontend/drizzle/manual/, scripts/atlas/, scripts/ingest/, docs/graph/, docs/reports/, docs/atlas/, memory/exports/, .tmp/, .opencode/, .cache/, .svelte-kit/, .github/, .vscode/
- Field alignment: sourceRef=canonical source identity; feature_id=stable feature lane identity; alias_id=cross-store alias for task and packet reconciliation; parent_atlas_card_id=offline synthesis card identity

## Top Features By Input

### feature_labels

| feature_id | count |
|---|---:|
| ui | 1765 |
| database | 1149 |
| llm | 367 |
| evidence | 316 |
| cache | 268 |
| graph | 220 |
| vector-search | 148 |
| gpu | 144 |
| ingest | 109 |
| auth | 87 |

### kanban_tasks

| feature_id | count |
|---|---:|
| ui | 1442 |
| database | 939 |
| evidence | 181 |
| llm | 162 |
| cache | 106 |
| graph | 90 |
| gpu | 78 |
| vector-search | 52 |
| ingest | 34 |
| auth | 22 |

### missing_feature_todos

| feature_id | count |
|---|---:|
| todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md | 135 |
| feature:todo:fadfc0e985f4f0e151eaf542 | 2 |
| opencode-recommendations-json | 2 |
| docs-graph | 1 |
| feature:todo:002df24db7233c4b96982982 | 1 |
| feature:todo:0255cb3ad2d2cf33a3f9450c | 1 |
| feature:todo:039e09ca423789739c8c42c5 | 1 |
| feature:todo:08a60b305944064051beac3a | 1 |
| feature:todo:0aa8e73629125ac4b069abd9 | 1 |
| feature:todo:0d3ab6734e763f3f7697cfc0 | 1 |

## Notes

- This audit is read-only. It does not mutate Postgres, Qdrant, Redis, Neo4j, DuckDB, or packet files.
- Root `.tmp` inputs are preferred. `sveltekit-frontend/.tmp` is used only when the requested root file is missing or empty.
- This turns hidden feature-labeling JSONL artifacts into a visible replay/join report for DuckDB mapreduce and Parent Atlas traversal.
