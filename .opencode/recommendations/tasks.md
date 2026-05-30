# Executable Task Cards — 2026-05-30T01:50:15.021Z

**11 tasks** across **8 clusters**

## Task Summary
| # | Risk | Cluster | Title | Command |
|---|------|---------|-------|---------|
| 1 | HIGH | Infrastructure | Verify TRACE MCP transport and add health probe route | `node scripts/mcp/verify-trace-health.mjs` |
| 2 | HIGH | Atlas | Wire schema-indexer contract into MCP search routing | `node scripts/atlas/wire-schema-indexer.mjs` |
| 3 | HIGH | Agent | Implement runAgentSkill via TRACE MCP | `node scripts/agents/implement-runAgentSkill.mjs` |
| 4 | MEDIUM | Data | Add 768d shadow pgvector columns and backfill | `node scripts/drizzle/generate-shadow-vector-migration.mjs` |
| 5 | MEDIUM | Graph | Generate cluster cards after codebase map stabilizes | `npm run graphify:cluster-summaries` |
| 6 | MEDIUM | Engram | Prime engram session context on startup | `node scripts/startup/prime-engram-session.mjs` |
| 7 | LOW | Legal Workspace | Feature not implemented: Priority 1: Evidence Upload UI (1 h | — |
| 8 | LOW | General | Feature not implemented: Priority 2: VLM POI Integration (90 | — |
| 9 | LOW | General | Feature not implemented: Priority 3: Audit Dashboard Web UI  | — |
| 10 | LOW | General | Feature not implemented: Priority 4: Auto-Fix Orchestrator ( | — |
| 11 | LOW | General | Feature not implemented: Phase 3: Post-Synthesis Quality Rev | — |

## By Cluster
### Infrastructure
#### [HIGH] Verify TRACE MCP transport and add health probe route
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: TRACE MCP is the canonical retrieval boundary and must be routinely health-checked.
- **Action**: Add a lightweight GET /health endpoint that proxies a TRACE MCP tools/list call and fails fast if TRACE is unreachable.
- **Run**: `node scripts/mcp/verify-trace-health.mjs`
- **sourceRefs**: scripts/mcp/, docs/opencode/SUB-MASTER-FEATURE-TODO-2026-05-27.md
- **task_id**: `task_a0ccc3d0`

### Atlas
#### [HIGH] Wire schema-indexer contract into MCP search routing
- **Type**: `missing_dependency`  **Status**: `todo`  **TTL**: 1d
- **Why**: schema-indexer contract cards exist but no MCP tool or route reads them for query routing.
- **Action**: Implement a TRACE MCP tool or HTTP GET /api/atlas/schema-search that queries memory/knowledge/schema-indexer-contract-cards.jsonl and returns top candidates.
- **Run**: `node scripts/atlas/wire-schema-indexer.mjs`
- **sourceRefs**: memory/knowledge/schema-indexer-contract-cards.jsonl, src/routes/api/atlas/audit/+server.ts
- **task_id**: `task_0356937e`

### Agent
#### [HIGH] Implement runAgentSkill via TRACE MCP
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: Agent executor route is a 501 stub; implement minimal runtime to call trace.kag_search and return top-5.
- **Action**: Implement `sveltekit-frontend/src/lib/server/agent-executor.ts` to call TRACE MCP and hook into /api/atlas/audit route.
- **Run**: `node scripts/agents/implement-runAgentSkill.mjs`
- **sourceRefs**: sveltekit-frontend/src/lib/server/agent-executor.ts, src/routes/api/atlas/audit/+server.ts
- **task_id**: `task_4806c418`

### Data
#### [MEDIUM] Add 768d shadow pgvector columns and backfill
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: Live DB uses 384d vectors but retrieval expects 768d - add shadow columns to migrate safely.
- **Action**: Create migration SQL to add vector(768) shadow columns, backfill from embeddings pipeline, and route retrieval to preferred column.
- **Run**: `node scripts/drizzle/generate-shadow-vector-migration.mjs`
- **sourceRefs**: sveltekit-frontend/drizzle/, docs/opencode/SUB-MASTER-FEATURE-TODO-2026-05-27.md
- **task_id**: `task_0c0fae32`

### Graph
#### [MEDIUM] Generate cluster cards after codebase map stabilizes
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: Cluster card flow depends on stable codebase map; automation should run post-graph export.
- **Action**: Run `npm run graphify:cluster-summaries` and write graph-refresh manifest; add a manifest version write step to export pipeline.
- **Run**: `npm run graphify:cluster-summaries`
- **sourceRefs**: docs/graph/codebase-map.md, scripts/graphify/
- **task_id**: `task_5968da47`

### Engram
#### [MEDIUM] Prime engram session context on startup
- **Type**: `developer_recommendation`  **Status**: `todo`  **TTL**: 7d
- **Why**: engram.session_context_inject must be called from workspace-bootstrap to warm KV cache.
- **Action**: Call engram.session_context_inject in antigravity agent prompt flow and verify in startup smoke.
- **Run**: `node scripts/startup/prime-engram-session.mjs`
- **sourceRefs**: docs/opencode/SUB-MASTER-FEATURE-TODO-2026-05-27.md, scripts/startup/ace-incremental-startup.mjs
- **task_id**: `task_0e9e18d9`

### Legal Workspace
#### [LOW] Feature not implemented: Priority 1: Evidence Upload UI (1 hour)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Display extracted text preview" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L182
- **task_id**: `task_3ed07167`

### General
#### [LOW] Feature not implemented: Priority 2: VLM POI Integration (90 min)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Wire photo VLM analysis to UI" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L188
- **task_id**: `task_c392194a`
#### [LOW] Feature not implemented: Priority 3: Audit Dashboard Web UI (3-4 hours)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Real-time GPU metrics (VRAM, temperature, utilization)" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L194
- **task_id**: `task_b4775ca4`
#### [LOW] Feature not implemented: Priority 4: Auto-Fix Orchestrator (6-8 hours)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "Identify duplicates from GPU audit" src docs tests
- **sourceRefs**: local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L201
- **task_id**: `task_9fa297e3`
#### [LOW] Feature not implemented: Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)
- **Type**: `missing_feature`  **Status**: `todo`  **TTL**: 7d
- **Why**: feature not yet implemented
- **Action**: rg "**Authority Audit**: Verify PageRank scores in Neo4j align with perceived file importance." src docs tests
- **sourceRefs**: local:docs/operator/atlas-production-roadmap.md#L5
- **task_id**: `task_4b63620a`
