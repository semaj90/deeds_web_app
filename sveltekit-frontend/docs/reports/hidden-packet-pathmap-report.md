# Hidden Packet Pathmap Report

Generated: 2026-06-05T15:34:29.458Z

## Packet Surface Counts

- .tmp/feature_labels.jsonl
  - line count: 3312
  - valid rows: 3312
  - invalid rows: 0
  - sourceRef coverage: 100%
  - featureId coverage: 100%
  - featureLabel coverage: 100%
- .tmp/kanban_tasks.jsonl
  - line count: 3312
  - valid rows: 3312
  - invalid rows: 0
  - sourceRef coverage: 100%
  - featureId coverage: 100%
  - featureLabel coverage: 100%
- .tmp/missing_feature_todos.jsonl
  - line count: 141
  - valid rows: 141
  - invalid rows: 0
  - sourceRef coverage: 100%
  - featureId coverage: 100%
  - featureLabel coverage: 100%

## Invalid JSONL Rows

- none

## Feature Label Coverage

- rows with feature_label: 6765
- coverage pct: 100%

## SourceRef Coverage

- rows with sourceRef: 6765
- coverage pct: 100%

## FeatureId Coverage

- rows with featureId: 6765
- coverage pct: 100%

## Path-Only Rows Needing source_ref

- none

## Missing FeatureId Todos

- line 1: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:21 title=**Knowledge Graph Tool Lanes**
- line 2: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:22 title=`attention_rank_files` — embed query → `attentionScoreGPU` via LibTorch → top-N from Karpathy scores
- line 3: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:23 title=`som_topology_stats` — delegate to `gpu:som_topology` for Redis SOM grid / centroid stats
- line 4: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:24 title=`language_distribution` — delegate to `gpu:language_distribution` for Qdrant cluster tag stats
- line 5: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:25 title=`playbook_lookup_by_language` — use CouchDB `karpathy_wiki` plus top Karpathy file intersection
- line 6: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:28 title=Route these tools into the correct skill families (`gpu-acceleration`, `vector-cluster`, `codebase`, `research`) without creating a parallel graph source of tru
- line 7: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:49 title=Clustering quality cleanup (deferred)
- line 8: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:55 title=Wire into API routes (`/api/cases`, `/api/evidence/upload`) — deferred
- line 9: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:71 title=**Track C — Production Gap Remediation** (after DB audit)
- line 10: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:74 title=Seed legal canon chunks (legal PDF ingest pipeline)
- line 11: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:75 title=Add Playwright test fixtures for auth + DB seeding
- line 12: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:80 title=Option 2: ClusterCard schema + Redis/Qdrant wiring + API route
- line 13: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:86 title=Warm workspace-start plans
- line 14: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:87 title=Warm legal/codebase summaries
- line 15: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:89 title=**Remaining Lower-Priority**
- line 16: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:90 title=Track 1: .env audit + dead-config archival
- line 17: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:91 title=Track 2: Docker CPU limits + Caddy memory bump
- line 18: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:93 title=Track 5C–5E: Model/GGUF cleanup
- line 19: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:234 title=Feature cluster grouping by `sourceRef` prefix
- line 20: sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:235 title=Stale feature detection (atlas entry exists, no recent git touch)

## Kanban Task Joins

- line 1: task=kanban-5b882548bfd3 featureId=feature:todo:1e95eb7b2c97aa52a6ec0308 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:21 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, **Knowledge Graph Tool Lanes**
- line 2: task=kanban-e85ec67be636 featureId=feature:todo:f831f8496459630481b6f126 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:22 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, `attention_rank_files` — embed query → `attentionScoreGPU` via LibTorch → top-N from Karpathy scores
- line 3: task=kanban-367ef736edbd featureId=feature:todo:2aed3e03cc66e3e478a5479d sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:23 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, `som_topology_stats` — delegate to `gpu:som_topology` for Redis SOM grid / centroid stats
- line 4: task=kanban-c94be4b7f14d featureId=feature:todo:a33b97f7501a9583a2e63c2b sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:24 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, `language_distribution` — delegate to `gpu:language_distribution` for Qdrant cluster tag stats
- line 5: task=kanban-bd3f0f6d443b featureId=feature:todo:322cf977b5fa41f902b9321b sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:25 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, `playbook_lookup_by_language` — use CouchDB `karpathy_wiki` plus top Karpathy file intersection
- line 6: task=kanban-c029e338268b featureId=feature:todo:4ced48dea132da38f2ab7305 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:28 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Route these tools into the correct skill families (`gpu-acceleration`, `vector-cluster`, `codebase`, `research`) without creating a parallel graph source of tru
- line 7: task=kanban-4d2c22a25d3f featureId=feature:todo:a11f763c236417569484b3e7 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:49 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Clustering quality cleanup (deferred)
- line 8: task=kanban-4666ceed33f2 featureId=feature:todo:787ff44880ddd6be2d9388ce sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:55 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Wire into API routes (`/api/cases`, `/api/evidence/upload`) — deferred
- line 9: task=kanban-95132d29e580 featureId=feature:todo:7c0dbd56784529c16e1cb60e sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:71 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, **Track C — Production Gap Remediation** (after DB audit)
- line 10: task=kanban-c47cc56e809a featureId=feature:todo:4afa9ddc2a7b74e522364100 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:74 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Seed legal canon chunks (legal PDF ingest pipeline)
- line 11: task=kanban-b4528d883940 featureId=feature:todo:c3913a6ae582b02ec6366094 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:75 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Add Playwright test fixtures for auth + DB seeding
- line 12: task=kanban-190dc27e5764 featureId=feature:todo:211e484d8c9f1b5087925e91 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:80 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Option 2: ClusterCard schema + Redis/Qdrant wiring + API route
- line 13: task=kanban-a826ba266ce3 featureId=feature:todo:f85f7b428819c0244985ab85 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:86 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Warm workspace-start plans
- line 14: task=kanban-ace78cb1afbd featureId=feature:todo:5855fc827e386a10b01a26db sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:87 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Warm legal/codebase summaries
- line 15: task=kanban-a43cf4f65693 featureId=feature:todo:132472e27f5f5116545a7ccf sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:89 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, **Remaining Lower-Priority**
- line 16: task=kanban-1c3d788fc073 featureId=feature:todo:dc13d165afeb65f00c87fe15 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:90 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Track 1: .env audit + dead-config archival
- line 17: task=kanban-d209d6dd0493 featureId=feature:todo:9289019adf7d2721550af764 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:91 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Track 2: Docker CPU limits + Caddy memory bump
- line 18: task=kanban-022e81f9aab7 featureId=feature:todo:d8d7affddeaa909af27f7d69 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:93 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Track 5C–5E: Model/GGUF cleanup
- line 19: task=kanban-1876c5b2b9c3 featureId=feature:todo:24b4111ad0e1777784a9bd1a sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:234 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Feature cluster grouping by `sourceRef` prefix
- line 20: task=kanban-567948832697 featureId=feature:todo:af15f2f3c8d9e6c470e05b29 sourceRef=todo:C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md#line:235 labels=todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md, Stale feature detection (atlas entry exists, no recent git touch)

## Parent Atlas Doc Crosswalk Joins

- TOC present: false
- doc-feature crosswalk present: false
- note: WARN: optional doc crosswalk inputs missing: docs/atlas/parent-atlas-table-of-contents.md, docs/reports/doc-feature-crosswalk-2026-06-01.md

## Next Repair Actions

- Backfill feature_id for any path-only rows.
- Normalize source_ref to the packet join key before replay.
- Join kanban tasks and missing feature todos to feature labels by feature_id.
- Treat missing doc crosswalk inputs as warnings in this checkout.
