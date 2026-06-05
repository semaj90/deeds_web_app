# Executable Task Cards — 2026-06-05T02:34:46.736Z

**17 tasks** across **5 clusters**

## Task Summary
| # | Risk | Cluster | Title | Command |
|---|------|---------|-------|---------|
| 1 | HIGH | UI Components | src/lib/components/ui/index.ts — 42 unresolved imports | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/index.ts'` |
| 2 | HIGH | UI Components | src/lib/components/ui/gaming/n64/index.ts — 29 unresolved im | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/n64/index.ts'` |
| 3 | HIGH | UI Components | src/lib/components/ui/gaming/index.ts — 18 unresolved import | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/index.ts'` |
| 4 | HIGH | UI Components | src/lib/components/ui/alert-dialog/index.js — 12 unresolved  | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/alert-dialog/index.js'` |
| 5 | HIGH | UI Components | src/lib/components/ui/dialog/index.ts — 11 unresolved import | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/dialog/index.ts'` |
| 6 | HIGH | General | src/lib/icons/yorha/index.ts — 12 unresolved imports | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/icons/yorha/index.ts'` |
| 7 | HIGH | Self-Healing Retrieval | 22 runtime packets returned fewer than 8 sourceRefs | `npm run atlas:runtime-packets:report && cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-runtime-packet-replay.mjs` |
| 8 | HIGH | Self-Healing Retrieval | 3 empty-sourceRef packets and 44 historical unknown sourceRe | `npm run atlas:runtime-packets:report` |
| 9 | HIGH | Self-Healing Retrieval | 22 runtime packets are missing SOM/cluster telemetry | `npm run atlas:coverage:qdrant-no-som -- --limit=25` |
| 10 | MEDIUM | Agent Workflow | 4 files unclassified with >10 imports | `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"` |
| 11 | MEDIUM | Self-Healing Retrieval | 3 runtime packets have no featureIds | `cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-route-runtime-packets.mjs` |
| 12 | MEDIUM | Self-Healing Retrieval | 5/23 recent runtime packets missing Redis LOD0 replay keys | `cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-runtime-packet-replay.mjs` |
| 13 | LOW | General | Feature not implemented: Priority 2: VLM POI Integration (90 | — |
| 14 | LOW | General | Feature not implemented: Priority 3: Audit Dashboard Web UI  | — |
| 15 | LOW | General | Feature not implemented: Priority 4: Auto-Fix Orchestrator ( | — |
| 16 | LOW | General | Feature not implemented: Phase 3: Post-Synthesis Quality Rev | — |
| 17 | LOW | Legal Workspace | Feature not implemented: Priority 1: Evidence Upload UI (1 h | — |

## By Cluster
### UI Components
#### [HIGH] src/lib/components/ui/index.ts — 42 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 42 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/index.ts'`
- **sourceRefs**: src/lib/components/ui/index.ts
- **task_id**: `task_d2dad154`
#### [HIGH] src/lib/components/ui/gaming/n64/index.ts — 29 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 29 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/n64/index.ts'`
- **sourceRefs**: src/lib/components/ui/gaming/n64/index.ts
- **task_id**: `task_5528f4b5`
#### [HIGH] src/lib/components/ui/gaming/index.ts — 18 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 18 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/index.ts'`
- **sourceRefs**: src/lib/components/ui/gaming/index.ts
- **task_id**: `task_1dfa7983`
#### [HIGH] src/lib/components/ui/alert-dialog/index.js — 12 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 12 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/alert-dialog/index.js'`
- **sourceRefs**: src/lib/components/ui/alert-dialog/index.js
- **task_id**: `task_f42f03c1`
#### [HIGH] src/lib/components/ui/dialog/index.ts — 11 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 11 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/dialog/index.ts'`
- **sourceRefs**: src/lib/components/ui/dialog/index.ts
- **task_id**: `task_732adba9`

### General
#### [HIGH] src/lib/icons/yorha/index.ts — 12 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "unclassified" barrel/index has 12 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/icons/yorha/index.ts'`
- **sourceRefs**: src/lib/icons/yorha/index.ts
- **task_id**: `task_2deedfa4`
#### [LOW] Feature not implemented: Priority 2: VLM POI Integration (90 min)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Wire photo VLM analysis to UI" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L188
- **task_id**: `task_97685f9d`
#### [LOW] Feature not implemented: Priority 3: Audit Dashboard Web UI (3-4 hours)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Real-time GPU metrics (VRAM, temperature, utilization)" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L194
- **task_id**: `task_3137e7d1`
#### [LOW] Feature not implemented: Priority 4: Auto-Fix Orchestrator (6-8 hours)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Identify duplicates from GPU audit" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L201
- **task_id**: `task_815f4e70`
#### [LOW] Feature not implemented: Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "**Authority Audit**: Verify PageRank scores in Neo4j align with perceived file importance." src docs tests
- **sourceRefs**: local:docs/operator/atlas-production-roadmap.md#L5
- **task_id**: `task_b93f1af8`

### Self-Healing Retrieval
#### [HIGH] 22 runtime packets returned fewer than 8 sourceRefs
- **Type**: `retrieval:low-context-density`  **Status**: `todo`  **TTL**: 7d
- **Why**: Route runtime telemetry shows 22/23 packets with Qdrant hits but low sourceRef density. This weakens replay, traversal, and recommendation lineage.
- **Action**: Review CHR97 cartridge hit expansion and sourceRef density thresholds; replay a representative packet before changing scoring.
- **Run**: `npm run atlas:runtime-packets:report && cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-runtime-packet-replay.mjs`
- **sourceRefs**: scripts/atlas/report-route-runtime-packets.mjs, sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts
- **task_id**: `task_e560ff90`
#### [HIGH] 3 empty-sourceRef packets and 44 historical unknown sourceRef hits
- **Type**: `retrieval:source-ref-provenance-gap`  **Status**: `todo`  **TTL**: 7d
- **Why**: Runtime packets must be replayable from sourceRef lineage. Empty or placeholder sourceRefs break Parent Atlas joins and Redis packet decoding.
- **Action**: Keep the sourceRef normalizer in the hot path and monitor new route_runtime_packets rows for empty/unknown refs.
- **Run**: `npm run atlas:runtime-packets:report`
- **sourceRefs**: sveltekit-frontend/src/lib/server/features/ai/ace/telemetry-source-ref-fallback.ts
- **task_id**: `task_c107cd35`
#### [HIGH] 22 runtime packets are missing SOM/cluster telemetry
- **Type**: `retrieval:missing-runtime-som-cluster`  **Status**: `todo`  **TTL**: 7d
- **Why**: Active production files have Qdrant and SOM coverage, but the runtime telemetry row is not always carrying the selected SOM cluster.
- **Action**: Resolve SOM cluster from sourceRefs or qdrant IDs before writing route_runtime_packets.
- **Run**: `npm run atlas:coverage:qdrant-no-som -- --limit=25`
- **sourceRefs**: sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts, scripts/atlas/sync-graph-truth-neo4j.mjs
- **task_id**: `task_7dc4e1e0`
#### [MEDIUM] 3 runtime packets have no featureIds
- **Type**: `retrieval:feature-id-provenance-gap`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature IDs are the join spine for recommendations, Neo4j ParentAtlasFeature nodes, and packet replay ranking.
- **Action**: Backfill feature IDs from parent_atlas_documents for telemetry sourceRefs before writing the runtime packet.
- **Run**: `cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-route-runtime-packets.mjs`
- **sourceRefs**: sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts
- **task_id**: `task_9bc21ae0`
#### [MEDIUM] 5/23 recent runtime packets missing Redis LOD0 replay keys
- **Type**: `cache:missing-runtime-lod0-packets`  **Status**: `todo`  **TTL**: 7d
- **Why**: A route_runtime_packets row without ace:telemetry:{id}:lod0 cannot be replayed from packet_id alone.
- **Action**: Replay smoke should continue checking Redis LOD0 coverage; investigate fire-and-forget compression misses if this remains nonzero.
- **Run**: `cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-runtime-packet-replay.mjs`
- **sourceRefs**: sveltekit-frontend/src/lib/server/features/ai/ace/telemetry-compressor.ts
- **task_id**: `task_f76db493`

### Agent Workflow
#### [MEDIUM] 4 files unclassified with >10 imports
- **Type**: `feature:unclassified`  **Status**: `todo`  **TTL**: 7d
- **Why**: Files with many imports but no feature label degrade ACE context quality
- **Action**: Add feature labels to mapreduce classification rules
- **Run**: `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"`
- **sourceRefs**: src/hooks.server.ts, src/lib/icons/yorha/index.ts, src/lib/index.ts
- **task_id**: `task_d1f69fb0`

### Legal Workspace
#### [LOW] Feature not implemented: Priority 1: Evidence Upload UI (1 hour)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Display extracted text preview" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L182
- **task_id**: `task_1e6bd546`
