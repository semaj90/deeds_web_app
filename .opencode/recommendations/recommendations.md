# Recommendations - 2026-06-05T02:49:32.705Z

**Total**: 17 recommendations across 5 clusters

## Top 10
1. **[HIGH]** `developer_recommendation` - src/lib/components/ui/index.ts — 42 unresolved imports
   - Feature "ui" barrel/index has 42 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/index.ts'`
2. **[HIGH]** `developer_recommendation` - src/lib/components/ui/gaming/n64/index.ts — 29 unresolved imports
   - Feature "ui" barrel/index has 29 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/n64/index.ts'`
3. **[HIGH]** `developer_recommendation` - src/lib/components/ui/gaming/index.ts — 18 unresolved imports
   - Feature "ui" barrel/index has 18 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/index.ts'`
4. **[HIGH]** `developer_recommendation` - src/lib/components/ui/alert-dialog/index.js — 12 unresolved imports
   - Feature "ui" barrel/index has 12 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/alert-dialog/index.js'`
5. **[HIGH]** `developer_recommendation` - src/lib/components/ui/dialog/index.ts — 11 unresolved imports
   - Feature "ui" barrel/index has 11 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/dialog/index.ts'`
6. **[HIGH]** `developer_recommendation` - src/lib/icons/yorha/index.ts — 12 unresolved imports
   - Feature "unclassified" barrel/index has 12 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/icons/yorha/index.ts'`
7. **[HIGH]** `retrieval:low-context-density` - 25 runtime packets returned fewer than 8 sourceRefs
   - Route runtime telemetry shows 25/26 packets with Qdrant hits but low sourceRef density. This weakens replay, traversal, and recommendation lineage.
   - Action: Review CHR97 cartridge hit expansion and sourceRef density thresholds; replay a representative packet before changing scoring.
   - `npm run atlas:runtime-packets:report && cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-runtime-packet-replay.mjs`
8. **[HIGH]** `retrieval:source-ref-provenance-gap` - 3 empty-sourceRef packets and 44 historical unknown sourceRef hits
   - Runtime packets must be replayable from sourceRef lineage. Empty or placeholder sourceRefs break Parent Atlas joins and Redis packet decoding.
   - Action: Keep the sourceRef normalizer in the hot path and monitor new route_runtime_packets rows for empty/unknown refs.
   - `npm run atlas:runtime-packets:report`
9. **[HIGH]** `retrieval:missing-runtime-som-cluster` - 25 runtime packets are missing SOM/cluster telemetry
   - Active production files have Qdrant and SOM coverage, but the runtime telemetry row is not always carrying the selected SOM cluster.
   - Action: Resolve SOM cluster from sourceRefs or qdrant IDs before writing route_runtime_packets.
   - `npm run atlas:coverage:qdrant-no-som -- --limit=25`
10. **[MEDIUM]** `feature:unclassified` - 4 files unclassified with >10 imports
   - Files with many imports but no feature label degrade ACE context quality
   - Action: Add feature labels to mapreduce classification rules
   - `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"`

## By Cluster
### UI Components
- [high] src/lib/components/ui/index.ts — 42 unresolved imports
- [high] src/lib/components/ui/gaming/n64/index.ts — 29 unresolved imports
- [high] src/lib/components/ui/gaming/index.ts — 18 unresolved imports
- [high] src/lib/components/ui/alert-dialog/index.js — 12 unresolved imports
- [high] src/lib/components/ui/dialog/index.ts — 11 unresolved imports

### General
- [high] src/lib/icons/yorha/index.ts — 12 unresolved imports
- [low] Feature not implemented: Priority 2: VLM POI Integration (90 min)
- [low] Feature not implemented: Priority 3: Audit Dashboard Web UI (3-4 hours)
- [low] Feature not implemented: Priority 4: Auto-Fix Orchestrator (6-8 hours)
- [low] Feature not implemented: Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)

### Agent Workflow
- [medium] 4 files unclassified with >10 imports

### Legal Workspace
- [low] Feature not implemented: Priority 1: Evidence Upload UI (1 hour)

### Self-Healing Retrieval
- [high] 25 runtime packets returned fewer than 8 sourceRefs
- [high] 3 empty-sourceRef packets and 44 historical unknown sourceRef hits
- [medium] 3 runtime packets have no featureIds
- [high] 25 runtime packets are missing SOM/cluster telemetry
- [medium] 4/25 recent runtime packets missing Redis LOD0 replay keys
