# Recommendations — 2026-06-09T20:44:30.128Z

**Total**: 18 recommendations across 5 clusters

## Top 10
1. **[HIGH]** `developer_recommendation` — src/lib/components/ui/index.ts — 42 unresolved imports
   - Feature "ui" barrel/index has 42 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/index.ts'`
2. **[HIGH]** `developer_recommendation` — src/lib/components/ui/gaming/n64/index.ts — 29 unresolved imports
   - Feature "ui" barrel/index has 29 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/n64/index.ts'`
3. **[HIGH]** `developer_recommendation` — src/lib/components/ui/gaming/index.ts — 18 unresolved imports
   - Feature "ui" barrel/index has 18 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/index.ts'`
4. **[HIGH]** `developer_recommendation` — src/lib/components/ui/alert-dialog/index.js — 12 unresolved imports
   - Feature "ui" barrel/index has 12 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/alert-dialog/index.js'`
5. **[HIGH]** `developer_recommendation` — src/lib/components/ui/dialog/index.ts — 11 unresolved imports
   - Feature "ui" barrel/index has 11 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/dialog/index.ts'`
6. **[HIGH]** `developer_recommendation` — src/lib/icons/yorha/index.ts — 12 unresolved imports
   - Feature "unclassified" barrel/index has 12 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/icons/yorha/index.ts'`
7. **[HIGH]** `atlas_coverage_gap` — Qdrant coverage: 33% (3539 files unembedded)
   - 3539 parent_atlas_documents rows have no qdrant_point_id. ACE packet source_refs will be empty for these files until embedded.
   - Action: Run graphify:semantic to embed 3539 missing files
   - `npm run graphify:semantic`
8. **[HIGH]** `atlas_coverage_gap` — SOM cluster coverage: 29% (3744 files unclassified)
   - 3744 parent_atlas_documents rows have no cluster_id. ACE packet cluster_id, som_cluster, and topology boosting are unavailable for these files.
   - Action: Run graphify:semantic-cluster to assign cluster_id to 3744 files
   - `npm run graphify:semantic-cluster`
9. **[HIGH]** `atlas_coverage_gap` — 2201 atlas_feature_map rows not joined to parent_atlas_documents
   - These files have feature map entries but no canonical parent_atlas_documents record. They are invisible to ACE packet assembly and cannot contribute to feature_ids.
   - Action: Re-run atlas sync to backfill missing parent_atlas_documents rows
   - `npm run atlas:sync`
10. **[MEDIUM]** `feature:unclassified` — 4 files unclassified with >10 imports
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

### Parent Atlas Coverage
- [high] Qdrant coverage: 33% (3539 files unembedded)
- [high] SOM cluster coverage: 29% (3744 files unclassified)
- [medium] atlas_feature_synthesis has only 12 rows — feature rollups incomplete
- [high] 2201 atlas_feature_map rows not joined to parent_atlas_documents
- [medium] SOM cluster on atlas_feature_map: 31% (3941 missing)
- [low] route_runtime_packets is empty — hot-path scoring unavailable
