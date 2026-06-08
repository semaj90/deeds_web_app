# Executable Task Cards — 2026-06-07T23:26:38.475Z

**12 tasks** across **4 clusters**

## Task Summary
| # | Risk | Cluster | Title | Command |
|---|------|---------|-------|---------|
| 1 | HIGH | UI Components | src/lib/components/ui/index.ts — 42 unresolved imports | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/index.ts'` |
| 2 | HIGH | UI Components | src/lib/components/ui/gaming/n64/index.ts — 29 unresolved im | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/n64/index.ts'` |
| 3 | HIGH | UI Components | src/lib/components/ui/gaming/index.ts — 18 unresolved import | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/index.ts'` |
| 4 | HIGH | UI Components | src/lib/components/ui/alert-dialog/index.js — 12 unresolved  | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/alert-dialog/index.js'` |
| 5 | HIGH | UI Components | src/lib/components/ui/dialog/index.ts — 11 unresolved import | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/dialog/index.ts'` |
| 6 | HIGH | General | src/lib/icons/yorha/index.ts — 12 unresolved imports | `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/icons/yorha/index.ts'` |
| 7 | MEDIUM | Agent Workflow | 4 files unclassified with >10 imports | `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"` |
| 8 | LOW | General | Feature not implemented: Priority 2: VLM POI Integration (90 | — |
| 9 | LOW | General | Feature not implemented: Priority 3: Audit Dashboard Web UI  | — |
| 10 | LOW | General | Feature not implemented: Priority 4: Auto-Fix Orchestrator ( | — |
| 11 | LOW | General | Feature not implemented: Phase 3: Post-Synthesis Quality Rev | — |
| 12 | LOW | Legal Workspace | Feature not implemented: Priority 1: Evidence Upload UI (1 h | — |

## By Cluster
### UI Components
#### [HIGH] src/lib/components/ui/index.ts — 42 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 42 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/index.ts'`
- **sourceRefs**: src/lib/components/ui/index.ts
- **task_id**: `task_841f14c0`
#### [HIGH] src/lib/components/ui/gaming/n64/index.ts — 29 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 29 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/n64/index.ts'`
- **sourceRefs**: src/lib/components/ui/gaming/n64/index.ts
- **task_id**: `task_9cbffc24`
#### [HIGH] src/lib/components/ui/gaming/index.ts — 18 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 18 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/gaming/index.ts'`
- **sourceRefs**: src/lib/components/ui/gaming/index.ts
- **task_id**: `task_c946e4ab`
#### [HIGH] src/lib/components/ui/alert-dialog/index.js — 12 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 12 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/alert-dialog/index.js'`
- **sourceRefs**: src/lib/components/ui/alert-dialog/index.js
- **task_id**: `task_26f73878`
#### [HIGH] src/lib/components/ui/dialog/index.ts — 11 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "ui" barrel/index has 11 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/dialog/index.ts'`
- **sourceRefs**: src/lib/components/ui/dialog/index.ts
- **task_id**: `task_1e72a3f0`

### General
#### [HIGH] src/lib/icons/yorha/index.ts — 12 unresolved imports
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Feature "unclassified" barrel/index has 12 dangling import refs (mapreduce v4 scan)
- **Action**: Audit barrel re-exports; remove or fix dangling import paths
- **Run**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/icons/yorha/index.ts'`
- **sourceRefs**: src/lib/icons/yorha/index.ts
- **task_id**: `task_413b0c22`
#### [LOW] Feature not implemented: Priority 2: VLM POI Integration (90 min)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Wire photo VLM analysis to UI" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L188
- **task_id**: `task_06f753c3`
#### [LOW] Feature not implemented: Priority 3: Audit Dashboard Web UI (3-4 hours)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Real-time GPU metrics (VRAM, temperature, utilization)" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L194
- **task_id**: `task_b75cfd45`
#### [LOW] Feature not implemented: Priority 4: Auto-Fix Orchestrator (6-8 hours)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Identify duplicates from GPU audit" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L201
- **task_id**: `task_e0ef5d9a`
#### [LOW] Feature not implemented: Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "**Authority Audit**: Verify PageRank scores in Neo4j align with perceived file importance." src docs tests
- **sourceRefs**: local:docs/operator/atlas-production-roadmap.md#L5
- **task_id**: `task_3e7c3793`

### Agent Workflow
#### [MEDIUM] 4 files unclassified with >10 imports
- **Type**: `feature:unclassified`  **Status**: `todo`  **TTL**: 7d
- **Why**: Files with many imports but no feature label degrade ACE context quality
- **Action**: Add feature labels to mapreduce classification rules
- **Run**: `node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"`
- **sourceRefs**: src/hooks.server.ts, src/lib/icons/yorha/index.ts, src/lib/index.ts
- **task_id**: `task_72bad680`

### Legal Workspace
#### [LOW] Feature not implemented: Priority 1: Evidence Upload UI (1 hour)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Display extracted text preview" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L182
- **task_id**: `task_3448a7b8`
