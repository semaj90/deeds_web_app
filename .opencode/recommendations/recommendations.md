# Recommendations — 2026-06-12T03:26:55.910Z

**Total**: 7 recommendations across 4 clusters

## Top 10
1. **[HIGH]** `developer_recommendation` — claude-mem/src/ui/viewer/App.tsx — 5 unresolved imports
   - Feature "ui" barrel/index has 5 dangling import refs (mapreduce v4 scan)
   - Action: Audit barrel re-exports; remove or fix dangling import paths
   - `node scripts/atlas/debug-import-resolve.mjs <import> 'claude-mem/src/ui/viewer/App.tsx'`
2. **[MEDIUM]** `feature:unclassified` — 4 files unclassified with >10 imports
   - Files with many imports but no feature label degrade ACE context quality
   - Action: Add feature labels to mapreduce classification rules
   - `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"`
3. **[LOW]** `missing_feature` — Feature not implemented: Priority 1: Evidence Upload UI (1 hour)
   - feature not yet implemented
   - Action: rg "Display extracted text preview" src docs tests
4. **[LOW]** `missing_feature` — Feature not implemented: Priority 2: VLM POI Integration (90 min)
   - feature not yet implemented
   - Action: rg "Wire photo VLM analysis to UI" src docs tests
5. **[LOW]** `missing_feature` — Feature not implemented: Priority 3: Audit Dashboard Web UI (3-4 hours)
   - feature not yet implemented
   - Action: rg "Real-time GPU metrics (VRAM, temperature, utilization)" src docs tests
6. **[LOW]** `missing_feature` — Feature not implemented: Priority 4: Auto-Fix Orchestrator (6-8 hours)
   - feature not yet implemented
   - Action: rg "Identify duplicates from GPU audit" src docs tests
7. **[LOW]** `missing_feature` — Feature not implemented: Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)
   - feature not yet implemented
   - Action: rg "**Authority Audit**: Verify PageRank scores in Neo4j align with perceived file importance." src docs tests

## By Cluster
### UI Components
- [high] claude-mem/src/ui/viewer/App.tsx — 5 unresolved imports

### Agent Workflow
- [medium] 4 files unclassified with >10 imports

### Legal Workspace
- [low] Feature not implemented: Priority 1: Evidence Upload UI (1 hour)

### General
- [low] Feature not implemented: Priority 2: VLM POI Integration (90 min)
- [low] Feature not implemented: Priority 3: Audit Dashboard Web UI (3-4 hours)
- [low] Feature not implemented: Priority 4: Auto-Fix Orchestrator (6-8 hours)
- [low] Feature not implemented: Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)
