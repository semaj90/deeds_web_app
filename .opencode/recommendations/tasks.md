# Executable Task Cards — 2026-06-12T03:01:26.467Z

**9 tasks** across **4 clusters**

## Task Summary
| # | Risk | Cluster | Title | Command |
|---|------|---------|-------|---------|
| 1 | HIGH | General | docs/engram-offline-processing-pipeline.md — 8 unresolved im | `node scripts/atlas/debug-import-resolve.mjs <import> 'docs/engram-offline-processing-pipeline.md'` |
| 2 | HIGH | General | docs/status/AUDIT_INFRASTRUCTURE_REVIEW.md — 6 unresolved im | `node scripts/atlas/debug-import-resolve.mjs <import> 'docs/status/AUDIT_INFRASTRUCTURE_REVIEW.md'` |
| 3 | HIGH | UI Components | claude-mem/src/ui/viewer/App.tsx — 5 unresolved imports | `node scripts/atlas/debug-import-resolve.mjs <import> 'claude-mem/src/ui/viewer/App.tsx'` |
| 4 | MEDIUM | Agent Workflow | 4 files unclassified with >10 imports | `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"` |
| 5 | LOW | General | Feature not implemented: Priority 2: VLM POI Integration (90 | — |
| 6 | LOW | General | Feature not implemented: Priority 3: Audit Dashboard Web UI  | — |
| 7 | LOW | General | Feature not implemented: Priority 4: Auto-Fix Orchestrator ( | — |
| 8 | LOW | General | Feature not implemented: Phase 3: Post-Synthesis Quality Rev | — |
| 9 | LOW | Legal Workspace | Feature not implemented: Priority 1: Evidence Upload UI (1 h | — |

## By Cluster
### General
#### [HIGH] docs/engram-offline-processing-pipeline.md — 8 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "unclassified" barrel/index has 8 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'docs/engram-offline-processing-pipeline.md'`
- **sourceRefs**: docs/engram-offline-processing-pipeline.md
- **task_id**: `task_7185e8d1`
#### [HIGH] docs/status/AUDIT_INFRASTRUCTURE_REVIEW.md — 6 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "unclassified" barrel/index has 6 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'docs/status/AUDIT_INFRASTRUCTURE_REVIEW.md'`
- **sourceRefs**: docs/status/AUDIT_INFRASTRUCTURE_REVIEW.md
- **task_id**: `task_09dbd4d7`
#### [LOW] Feature not implemented: Priority 2: VLM POI Integration (90 min)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Wire photo VLM analysis to UI" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L188
- **task_id**: `task_8a753e9e`
#### [LOW] Feature not implemented: Priority 3: Audit Dashboard Web UI (3-4 hours)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Real-time GPU metrics (VRAM, temperature, utilization)" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L194
- **task_id**: `task_7c5b8040`
#### [LOW] Feature not implemented: Priority 4: Auto-Fix Orchestrator (6-8 hours)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Identify duplicates from GPU audit" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L201
- **task_id**: `task_113dce25`
#### [LOW] Feature not implemented: Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "**Authority Audit**: Verify PageRank scores in Neo4j align with perceived file importance." src docs tests
- **sourceRefs**: local:docs/operator/atlas-production-roadmap.md#L5
- **task_id**: `task_2e5f2741`

### UI Components
#### [HIGH] claude-mem/src/ui/viewer/App.tsx — 5 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 5 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'claude-mem/src/ui/viewer/App.tsx'`
- **sourceRefs**: claude-mem/src/ui/viewer/App.tsx
- **task_id**: `task_018f279b`

### Agent Workflow
#### [MEDIUM] 4 files unclassified with >10 imports
- **Type**: `feature:unclassified`  **Status**: `todo`  **TTL**: 7d
- **Why**: Files with many imports but no feature label degrade ACE context quality
- **Action**: Add feature labels to mapreduce classification rules
- **Run**: `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"`
- **sourceRefs**: claude-mem/src/cli/handlers/session-init.ts, claude-mem/src/npx-cli/commands/install.ts, claude-mem/src/server/generation/ProviderObservationGenerator.ts
- **task_id**: `task_c7e050ad`

### Legal Workspace
#### [LOW] Feature not implemented: Priority 1: Evidence Upload UI (1 hour)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Display extracted text preview" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L182
- **task_id**: `task_816ab99e`
