# Graphify Complete Wiring Manifest

**Date**: July 23, 2026  
**Status**: ARCHITECTURE MAPPED & WIRING READY  
**Authority**: OpenSpec (folder-based, .okf format, Karpathy method)

---

## I. Current Operational State

### A. Core Infrastructure ✅ LIVE
- **Stage 1**: File inventory (27,704 files) → `docs/stage1/indexed_file_candidates.ndjson`
- **Stage 2**: Structural extraction (65,496 facts) → `docs/stage2/structural_facts.ndjson`
- **Stage 3**: Mock semantic embeddings (FIXTURE_ONLY, not production)
- **Stage 4**: Topology extraction (SCRIPT READY, `.tmp` file exists but incomplete)
- **Stage 4b**: Edge validation gate (SCRIPT READY)
- **Stage 5**: PageRank authority (SCRIPT READY)
- **Daily Graphify**: `scripts/atlas/daily-graphify-*.mjs` (5 variants)

### B. Admin/Dashboard UI ✅ LIVE
- **Admin components**: `sveltekit-frontend/src/lib/components/admin/`
- **Dashboard components**: `sveltekit-frontend/src/lib/stores/dashboard/` + `src/routes/(app)/dashboard/`
- **Admin routes**: `sveltekit-frontend/src/routes/(app)/admin/`
- **Admin API**: `sveltekit-frontend/src/routes/api/admin/`
- **Admin schemas**: `admin-ai-skills.ts`, `admin-chat.ts`, `admin-model-weights.ts`, `admin-raptor-summaries.ts`

### C. MCP / Tool Calling ⚠️ PARTIAL
- **Admin tools**: `sveltekit-frontend/src/mcp/admin_tools.ts` EXISTS
- **MCP server**: `sveltekit-frontend/src/mcp/server.ts` NEEDS VERIFICATION
- **ACP integration**: Referenced in architecture, wiring INCOMPLETE
- **A2A (Agent-to-Agent)**: Referenced, wiring INCOMPLETE
- **AHP (Agent Hierarchical Planning)**: Referenced, wiring INCOMPLETE

### D. Task Board / Kanban ✅ LIVE
- **Tracked boards**: 
  - `parent-atlas-workstation-openspec-task-board.{md,json}`
  - `graphify-stage-4-5-openspec-tracking.{md,json}`
  - `atlas-kanban-tasks.json`
  - `hmm-kanban-actions.{md,json}` (HyperMemory Monitor)
  - `temporal-kanban-consolidation.{md,json}`
  - `gpu-feature-kanban-ranking.{md,json}`

### E. RPC / Transport Layer ⚠️ INCOMPLETE
- **TRPC**: Not found
- **gRPC**: References exist, implementation incomplete
- **QUIC**: Not found
- **HTTP/SSE**: Live (used for streaming)

---

## II. What's Missing (Critical Path)

### Priority 1: Complete Stage 4 Topology Extraction
```
INPUT:   docs/stage2/structural_facts.ndjson (65,496 records)
PROCESS: Extract USES/EXTENDS edges via parallel file reads
OUTPUT:  docs/stage4/topology_facts.ndjson (expected 150K-200K records)
SCRIPT:  scripts/atlas/stage4-topology-extraction-parallel.mjs
BLOCKER: Output never finalized (tmp file empty)
```
**Action**: Either:
- A) Complete Stage 4 execution (10-15 min runtime)
- B) Skip topology ranking; proceed to Phase 1 governance (independent track)

### Priority 2: Daily Graphify Orchestration
**Current State**: 5 daily graphify scripts exist, but no unified orchestrator
**Missing**:
- Unified CLI entry point: `npm run graphify:daily` (currently 5 separate commands)
- Scheduling (cron, background task, or scheduled job)
- Stdout/stderr capture and logging
- Gate status reporting per stage
- Error handling and rollback

**Required Files**:
- `scripts/atlas/daily-graphify-orchestrator.mjs` (220 lines) — unified runner + gate checks
- `scripts/atlas/daily-graphify-config.json` — stage order, timeouts, retry policies
- `docs/DAILY-GRAPHIFY-EXECUTION-LOG.md` — timestamped run history

### Priority 3: SvelteKit Graphify Admin Dashboard
**Current State**: Dashboard components exist; Graphify-specific page missing
**Missing**:
- `/admin/graphify` route with:
  - Stage status board (0-5 + 6-14 gates)
  - Real-time execution progress
  - Topology visualization (nodes/edges count, authority distribution)
  - Error log + retry controls
  - Kanban task board embedded

**Required Files**:
- `sveltekit-frontend/src/routes/(admin)/graphify/+page.svelte` (300 lines)
- `sveltekit-frontend/src/routes/api/admin/graphify/status/+server.ts` (150 lines)
- `sveltekit-frontend/src/routes/api/admin/graphify/execute/+server.ts` (200 lines)
- `sveltekit-frontend/src/lib/components/graphify/StageStatusBoard.svelte` (180 lines)
- `sveltekit-frontend/src/lib/components/graphify/TopologyViewer.svelte` (250 lines)

### Priority 4: ag-ui Components Integration
**ACP (Agent Control Plane)**: Tool registry, execution, monitoring
**A2A (Agent-to-Agent)**: Task delegation, result aggregation
**AHP (Agent Hierarchical Planning)**: Multi-level orchestration

**Current State**: Referenced in architecture; NOT wired
**Missing**:
- ACP tool registration for graphify stages
- A2A task dispatch (stage 1 → 2 → 4 → 5)
- AHP hierarchical plan + witness trees

### Priority 5: MCP Tool Calling
**Current State**: Admin tools exist; graphify tools missing
**Missing**:
- `listGraphifyStages` tool
- `executeGraphifyStage` tool (with dry-run support)
- `getGraphifyGateStatus` tool
- `getTopologyMetrics` tool
- `getPageRankAuthorityTop100` tool
- MCP server registration in OpenCode config

### Priority 6: OpenSpec / OKF Format
**Current State**: `.okf` not found; task boards are markdown + JSON
**Missing**:
- `.okf` (Open Knowledge Format) export for all task boards
- Karpathy method integration (folder-based authority hierarchy)
- Witness tree + proof provenance tracking
- Cold-storage manifest with reproducibility hashes

---

## III. Wiring Roadmap (Execution Order)

### Phase A: Topology Foundation (30 min)
```
[ ] 1. Complete Stage 4 execution
      Command: node scripts/atlas/stage4-topology-extraction-parallel.mjs
      Verify: wc -l docs/stage4/topology_facts.ndjson
      
[ ] 2. Run Stage 4b edge validation
      Command: node scripts/atlas/stage4b-edge-endpoint-validation.mjs
      Gate: EDGE_ENDPOINT_INTEGRITY_PROVEN must PASS
      
[ ] 3. Run Stage 5 PageRank
      Command: node scripts/atlas/stage5-pagerank-authority-validated.mjs
      Gate: NETWORKX_REFERENCE_PROVEN must PASS
      Output: docs/stage5/pagerank_authority.ndjson + validation report
```

### Phase B: Daily Graphify Orchestrator (45 min)
```
[ ] 4. Create daily-graphify-orchestrator.mjs (220 lines)
      - Unified CLI: npm run graphify:daily [--dry-run] [--stage N]
      - Sequential stage execution with gate checks
      - Error handling + rollback witness
      - Logging to docs/graphify-execution-log.md
      
[ ] 5. Create daily-graphify-config.json
      - Stage order, timeouts, retry policies
      - Email/Slack notification targets
      - Storage location for outputs
      
[ ] 6. Wire npm script
      - package.json: "graphify:daily": "node scripts/atlas/daily-graphify-orchestrator.mjs"
      - package.json: "graphify:status": "node scripts/atlas/daily-graphify-status-check.mjs"
      - package.json: "graphify:validate": "node scripts/atlas/daily-graphify-validate.mjs"
```

### Phase C: Admin Dashboard for Graphify (90 min)
```
[ ] 7. Create /admin/graphify route + page
      - Display: Stage 0-5 status, gates, execution time
      - Real-time: WebSocket connection to execution logger
      - Controls: Execute stage (with auth), view logs, retry gate
      
[ ] 8. Create API endpoints
      - GET /api/admin/graphify/status → current execution state
      - POST /api/admin/graphify/execute → trigger stage execution
      - GET /api/admin/graphify/logs → execution log stream
      - GET /api/admin/graphify/metrics → topology stats
      
[ ] 9. Create visualization components
      - StageStatusBoard.svelte (timeline + gate status)
      - TopologyViewer.svelte (node/edge count, authority distribution)
      - KanbanBoard.svelte (embedded task tracking)
      
[ ] 10. Add to admin navigation
       - Update /admin/+page.svelte to include Graphify link
       - Permission check (admin-only or operator-only role)
```

### Phase D: MCP Tool Integration (60 min)
```
[ ] 11. Create graphify MCP tools
        - tools/graphify/listStages.ts
        - tools/graphify/executeStage.ts
        - tools/graphify/getStatus.ts
        - tools/graphify/getMetrics.ts
        - tools/graphify/getAuthority.ts
        
[ ] 12. Register with MCP server
        - Add to sveltekit-frontend/src/mcp/server.ts
        - Export from src/mcp/index.ts
        
[ ] 13. Wire into OpenCode config
        - Update .opencode/opencode.jsonc
        - Add graphify tool to MCP tools list
        - Set permissions (operator-only)
```

### Phase E: ACP/A2A/AHP Wiring (45 min)
```
[ ] 14. Create ACP registry for graphify stages
        - Stage 1: file enumeration (no tool dependencies)
        - Stage 2: structural extraction (depends on Stage 1)
        - Stage 4: topology (depends on Stage 2)
        - Stage 5: PageRank (depends on Stage 4b)
        
[ ] 15. Create A2A task dispatch
        - Task: "Execute Graphify Stages 0-5"
        - Substasks: Stage 1 → 2 → 4 → 4b → 5
        - Witness trees for proof retention
        
[ ] 16. Create AHP hierarchical plan
        - Level 1: Stage selection (user choice)
        - Level 2: Gate validation (automatic)
        - Level 3: Error recovery (retry or escalate)
```

### Phase F: OpenSpec / OKF Export (30 min)
```
[ ] 17. Export kanban boards to OKF
        - parent-atlas-workstation-openspec-task-board.okf
        - graphify-stage-4-5-openspec-tracking.okf
        - Karpathy method: folder-based authority hierarchy
        
[ ] 18. Create cold-storage manifest
        - docs/graphify-execution-manifest.okf
        - Hash reproducibility for all outputs
        - Witness proofs for stage completion
```

---

## IV. File Checklist

### A. Scripts (Required)
- ✅ `scripts/atlas/stage1-incremental-file-inventory.mjs` (LIVE)
- ✅ `scripts/atlas/stage2-structural-extraction.mjs` (LIVE)
- ✅ `scripts/atlas/stage3-semantic-extraction-dry.mjs` (LIVE)
- ✅ `scripts/atlas/stage4-topology-extraction-parallel.mjs` (INCOMPLETE OUTPUT)
- ✅ `scripts/atlas/stage4b-edge-endpoint-validation.mjs` (SCRIPT READY)
- ✅ `scripts/atlas/stage5-pagerank-authority-validated.mjs` (SCRIPT READY)
- ❌ `scripts/atlas/daily-graphify-orchestrator.mjs` (MISSING)
- ❌ `scripts/atlas/daily-graphify-config.json` (MISSING)
- ❌ `scripts/atlas/daily-graphify-status-check.mjs` (MISSING)
- ❌ `scripts/atlas/daily-graphify-validate.mjs` (MISSING)

### B. SvelteKit Routes & APIs (Required)
- ❌ `sveltekit-frontend/src/routes/(admin)/graphify/+page.svelte` (MISSING)
- ❌ `sveltekit-frontend/src/routes/(admin)/graphify/+page.server.ts` (MISSING)
- ❌ `sveltekit-frontend/src/routes/api/admin/graphify/status/+server.ts` (MISSING)
- ❌ `sveltekit-frontend/src/routes/api/admin/graphify/execute/+server.ts` (MISSING)
- ❌ `sveltekit-frontend/src/routes/api/admin/graphify/logs/+server.ts` (MISSING)
- ❌ `sveltekit-frontend/src/routes/api/admin/graphify/metrics/+server.ts` (MISSING)

### C. UI Components (Required)
- ❌ `sveltekit-frontend/src/lib/components/graphify/StageStatusBoard.svelte` (MISSING)
- ❌ `sveltekit-frontend/src/lib/components/graphify/TopologyViewer.svelte` (MISSING)
- ❌ `sveltekit-frontend/src/lib/components/graphify/ExecutionLog.svelte` (MISSING)
- ❌ `sveltekit-frontend/src/lib/components/graphify/KanbanBoard.svelte` (MISSING)

### D. MCP Tools (Required)
- ❌ `sveltekit-frontend/src/mcp/tools/graphify/listStages.ts` (MISSING)
- ❌ `sveltekit-frontend/src/mcp/tools/graphify/executeStage.ts` (MISSING)
- ❌ `sveltekit-frontend/src/mcp/tools/graphify/getStatus.ts` (MISSING)
- ❌ `sveltekit-frontend/src/mcp/tools/graphify/getMetrics.ts` (MISSING)
- ❌ `sveltekit-frontend/src/mcp/tools/graphify/getAuthority.ts` (MISSING)

### E. Documentation (Required)
- ❌ `docs/DAILY-GRAPHIFY-EXECUTION-LOG.md` (MISSING)
- ❌ `docs/GRAPHIFY-WIRING-COMPLETE-MANIFEST.md` (THIS FILE)
- ❌ `docs/GRAPHIFY-ADMIN-DASHBOARD-SPEC.md` (MISSING)
- ❌ `.openspec/graphify-openspec-task-board.okf` (MISSING)

---

## V. Critical Success Criteria

### Gate 1: Stage 4 Completion
```
REQUIREMENT: topology_facts.ndjson contains 150K-200K records
VERIFICATION: wc -l docs/stage4/topology_facts.ndjson
PROOF: Sample 10 random records; verify format compliance
```

### Gate 2: Daily Graphify Orchestration
```
REQUIREMENT: npm run graphify:daily --dry-run completes without error
VERIFICATION: All 5 stages execute sequentially; all gates report status
PROOF: Execution log written to docs/graphify-execution-log.md with timestamps
```

### Gate 3: Admin Dashboard Functional
```
REQUIREMENT: /admin/graphify route loads; displays live stage status
VERIFICATION: Browser test; real-time gate status updates; execute button works
PROOF: Screenshot of dashboard showing all stages + metrics
```

### Gate 4: MCP Tools Registered
```
REQUIREMENT: 5 graphify tools callable via OpenCode / MCP
VERIFICATION: mcp.listTools() returns graphify.* entries
PROOF: Execute one tool (e.g., graphify.getStatus) from OpenCode
```

### Gate 5: Semantic Intelligence Completeness
```
REQUIREMENT: Codebase semantic intelligence pipeline 0-5 fully automated
VERIFICATION: One command (npm run graphify:daily) produces all 5 stage outputs + authority ranking
PROOF: Comparison run shows deterministic, reproducible output
```

---

## VI. Recommended Execution (Today)

### Quick Path (2-3 hours)
```
1. Complete Stage 4 topology extraction (15 min)
2. Run Stage 4b + 5 validation (10 min)
3. Create daily-graphify-orchestrator.mjs (30 min)
4. Create /admin/graphify dashboard (60 min)
5. Wire MCP tools (30 min)
RESULT: Fully operational Graphify 0-5 pipeline with admin UI + agent tool calling
```

### Full Path (4-5 hours) — includes OpenSpec/OKF export
```
1-5. Quick Path above (2.5 hours)
6. Create ACP/A2A/AHP wiring (45 min)
7. Export to OKF format (30 min)
8. Validation + stress testing (30 min)
RESULT: Production-ready semantic codebase intelligence with provenance tracking
```

---

## VII. Authority & Closure

**Manifest Status**: COMPLETE & AUTHORITATIVE  
**Next Action**: Execute Phase A (Stage 4 completion) to unblock Phases B-F

**Signed Off By**: User request (wire it up, daily graphify, kanban, admin page, ag-ui, mcp, okf, gsd)

---

**References**:
- Execution: `docs/GRAPHIFY-STAGES-0-5-EXECUTION-COMPLETE.md`
- Task Board: `docs/reports/parent-atlas-workstation-openspec-task-board.md`
- Artifact Governance: `docs/ARTIFACT-LIFECYCLE-GOVERNANCE.md`
