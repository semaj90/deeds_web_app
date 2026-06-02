# Recommendations — 2026-06-02T05:26:03.251Z

**Total**: 12 recommendations across 4 clusters

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
5. **[HIGH]** `developer_recommendation` — src/lib/icons/yorha/index.ts — 12 unresolved imports
   - Feature "unclassified" barrel/index has 12 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/icons/yorha/index.ts'`
6. **[HIGH]** `developer_recommendation` — src/lib/components/ui/dialog/index.ts — 11 unresolved imports
   - Feature "ui" barrel/index has 11 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/dialog/index.ts'`
7. **[MEDIUM]** `missing_dependency` — 4 files unclassified with >10 imports
   - Files with many imports but no feature label degrade ACE context quality
   - Action: Add feature labels to mapreduce classification rules
   - `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"`
8. **[LOW]** `missing_feature` — Feature not implemented: Priority 1: Evidence Upload UI (1 hour)
   - feature not yet implemented
   - Action: rg "Display extracted text preview" src docs tests
9. **[LOW]** `missing_feature` — Feature not implemented: Priority 2: VLM POI Integration (90 min)
   - feature not yet implemented
   - Action: rg "Wire photo VLM analysis to UI" src docs tests
10. **[LOW]** `missing_feature` — Feature not implemented: Priority 3: Audit Dashboard Web UI (3-4 hours)
   - feature not yet implemented
   - Action: rg "Real-time GPU metrics (VRAM, temperature, utilization)" src docs tests

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
