# Phase 0: Critical Blocker Resolution

**Status**: Ready for execution  
**Date**: July 19, 2026  
**Target**: Unblock Phase 1-17 ingestion pipeline implementation

---

## Four Critical Blockers

All four blockers must PASS before Phase 1 implementation can proceed.

### Blocker 1: Source_ref Identity Derivation Chain

**Problem**: `source_ref` is conflated across three separate concepts:
- Official doc URL (e.g., `https://...api-docs/users`)
- Repo file path (e.g., `src/lib/server/auth.ts`)
- Temporal task_id (e.g., `task:embed:2026-07-19:abc123`)

**Root Cause**:
- Line 49 of `scripts/atlas/sync-parent-atlas-packets-to-postgres.mjs`: `source_ref = packet.source_path || packet.packet_id`
- Backfill script searches 10+ aliases (no canonical source)
- Schema doesn't enforce identity at write time

**Success Criteria**:
- ✅ 0 missing/null `source_ref` values
- ✅ 100% of `source_ref` match regex `/^(task:|src/|docs/|api-docs/)/`
- ✅ 0 duplicate `source_ref + packet_key` combinations

**Script**: `scripts/atlas/validate-source-ref-identity.mjs`

```bash
# Dry-run (audit only)
npm run atlas:phase0:validate-source-ref:dry

# Apply fix (backfill from OKF bundle + task metadata)
npm run atlas:phase0:validate-source-ref:fix
```

**Expected Output**:
```
✅ ALL CHECKS PASSED — source_ref identity is clean
   Missing source_ref: 0
   Invalid format: 0
   Duplicate pairs: 0
   Coverage: 100%
```

---

### Blocker 2: Qdrant CPU Timeout on 768-dim ANN

**Problem**: Stock Qdrant has NO native GPU support. HNSW is sequential on CPU.  
768-dim vectors × 40K+ points = O(n·m) comparisons per query.

**Root Cause**:
- `codebase_chunks_768` collection uses legacy 768-dim vectors
- Sequential HNSW search on CPU can timeout on large queries
- No prefiltering or dimension reduction

**Success Criteria**:
- ✅ p99 latency < 100ms (excellent) → keep 768-dim setup
- ⚠️ p99 latency 100-150ms (acceptable) → monitor closely
- ❌ p99 latency > 150ms (too slow) → migrate to Phase 9 multi-vector

**Script**: `scripts/atlas/benchmark-qdrant-768-latency.mjs`

```bash
# Run benchmark (100 queries, report p99)
npm run atlas:phase0:benchmark-qdrant:768

# Verbose output (show individual query times)
npm run atlas:phase0:benchmark-qdrant:768:verbose
```

**Expected Output** (if p99 < 100ms):
```
✅ EXCELLENT (p99 < 100ms) — Current 768-dim setup is fast enough
   Min: 5ms, Median: 25ms, P99: 87ms, Max: 150ms
   Action: No migration needed. Optimize HNSW parameters if desired.
```

**Expected Output** (if p99 > 150ms):
```
⚠️ SLOW (150ms ≤ p99 < 500ms) — Performance is degraded
   Action: Plan Phase 9 multi-vector migration (384/128/64 named vectors)
```

---

### Blocker 3: MCP Transport Boundary & Gemma4 Invocation

**Problem**: MCP endpoint may have SSE connection issues. Gemma4 invocation pattern unclear.

**Root Cause**:
- Streamable HTTP at :8788 with `sessionIdGenerator: undefined`
- No clear documentation of whether Gemma4 tool exists or how it's invoked

**Success Criteria**:
- ✅ 10/10 consecutive `/mcp` requests succeed
- ✅ `tools/list` returns 40+ tools
- ✅ No timeout or SSE failures

**Script**: `scripts/atlas/health-check-mcp-transport.mjs`

```bash
# Run health check (10 requests)
npm run atlas:phase0:health-check:mcp

# Verbose output (show tool list)
npm run atlas:phase0:health-check:mcp:verbose
```

**Expected Output**:
```
✅ G38_MCP_TRANSPORT: PASS
   [1/10] ✅ tools/list returned 42 tools
   [2/10] ✅ tools/list returned 42 tools
   ...
   [10/10] ✅ tools/list returned 42 tools
   
   MCP endpoint is healthy and responsive
```

---

### Blocker 4: Gemma4 Artifact Overuse

**Problem**: Gemma4 may be overused in payload extraction path (100ms+ latency per call).

**Root Cause**:
- `backfill-atlas-source-refs.mjs:43-62` iterates 10+ field aliases
- Opportunity to replace Gemma4 with regex/jq (2 lines, instant)

**Success Criteria**:
- ✅ Identify all Gemma4 callsites
- ✅ Categorize as essential, nice-to-have, or removable
- ✅ Recommend optimizations for removable calls

**Script**: `scripts/atlas/audit-gemma4-callsites.mjs`

```bash
# Audit callsites (categorize by type)
npm run atlas:phase0:audit:gemma4

# Verbose output (show code snippets)
npm run atlas:phase0:audit:gemma4:verbose
```

**Expected Output**:
```
🟢 REMOVABLE (optimize away):
   [1] scripts/atlas/backfill-atlas-source-refs.mjs:45
       Recommended optimization:
         • Use jq filter: jq 'try .source_ref // .file_path // .packet_id'
         • Removes 100ms+ latency per extraction
         
Estimated token savings from removable calls: ~15000 tokens
Latency savings: ~300ms per run
```

---

## Execution Plan

### Option A: Individual Checks (Parallel)
```bash
# All can run in parallel (independent checks)
npm run atlas:phase0:validate-source-ref:dry &
npm run atlas:phase0:benchmark-qdrant:768 &
npm run atlas:phase0:health-check:mcp &
npm run atlas:phase0:audit:gemma4 &
wait
```

### Option B: Orchestrated (Recommended)
```bash
# Dry-run: audit + benchmark (no writes)
npm run atlas:phase0:all:dry

# Apply: fixes + audit + benchmark
npm run atlas:phase0:all:fix

# Verbose: detailed output + fixes
npm run atlas:phase0:all:verbose
```

### Option C: Manual Execution
```bash
# 1. Source_ref validation + backfill
npm run atlas:phase0:validate-source-ref:dry
npm run atlas:phase0:validate-source-ref:fix

# 2. Qdrant benchmark
npm run atlas:phase0:benchmark-qdrant:768

# 3. MCP health check
npm run atlas:phase0:health-check:mcp

# 4. Gemma4 audit
npm run atlas:phase0:audit:gemma4
```

---

## Success Criteria (ALL Must PASS)

| Blocker | Gate | Expected Result |
|---------|------|-----------------|
| **Source_ref** | Coverage ≥ 95% + 0 duplicates | ✅ Valid format, unique identity |
| **Qdrant** | p99 latency decision | ✅ Keep/Monitor/Migrate recommendation |
| **MCP** | 10/10 health checks | ✅ Tools/list returns 40+ tools |
| **Gemma4** | Callsite audit | ✅ Essential/Nice/Removable categorization |

---

## Phase 17 End-to-End Smoke Test

Once Phase 0 PASSES, run the complete topology smoke test:

```bash
npm run atlas:phase17:end-to-end:smoke
```

This verifies all 10 phases work end-to-end:
1. Postgres canonical packet ✅
2. Embedding baseline ✅
3. Qdrant payload parity ✅
4. PyTorch transforms ✅
5. Neo4j topology ✅
6. Topology authority table ✅
7. Redis centroid cache ✅
8. ACE packet generation ✅
9. Gemma4 planning ✅
10. Mastra workflow ✅

**Pass Criteria**: All 10 checks PASS (exit code 0)

---

## Timeline

| Phase | Duration | Work |
|-------|----------|------|
| **Phase 0** | ~90 min | Execute blockers: 40min parallel + 50min sequential |
| **Phase 17 Smoke** | ~5 min | End-to-end validation |
| **Total** | ~100 min | Ready for Phase 1 implementation |

---

## Decision Tree (After Phase 0)

```
All 4 blockers PASS?
  ├─ YES → Run Phase 17 smoke test
  │         ├─ PASS → Begin Phase 1 implementation
  │         │         ├─ OKF adapter (okf-langchain-adapter.ts)
  │         │         ├─ gRPC contract (hyperrag.proto)
  │         │         ├─ Arrow IPC (ingest-arrow-artifact.mjs)
  │         │         ├─ Embedding worker (embedding-artifact-worker.mjs)
  │         │         └─ Workflow orchestrator (document-ingestion-workflow.mjs)
  │         └─ FAIL → Debug Phase 17 failure (likely schema/data issue)
  │
  └─ NO → Investigate blocker failures
          ├─ Source_ref: Check OKF bundle and task metadata backfill
          ├─ Qdrant: If p99 > 150ms, plan Phase 9 migration
          ├─ MCP: Check :8788 server, verify Streamable transport
          └─ Gemma4: Review audit output, optimize removable calls
```

---

## Notes for Operator

- **Phase 0.1 (source_ref fix)** requires write access. Review backfill logic before applying.
- **Phase 0.2 (Qdrant benchmark)** is read-only. No impact on production data.
- **Phase 0.3 (MCP health)** requires :8788 running. Check if trace-mcp-server.ts is deployed.
- **Phase 0.4 (Gemma4 audit)** is read-only. Pure code analysis via regex.

---

## Reference

- **Blocker Details**: `PHASE-0-BLOCKER-RESOLUTION.md` (this file)
- **Blocker Scripts**: `scripts/atlas/validate-source-ref-identity.mjs`, `benchmark-qdrant-768-latency.mjs`, `health-check-mcp-transport.mjs`, `audit-gemma4-callsites.mjs`
- **Orchestrator**: `scripts/atlas/phase0-orchestrator.mjs`
- **End-to-End Test**: `scripts/atlas/phase-17-end-to-end-topology-smoke.mjs`
- **Phase 1 Plan**: [INSERT LINK TO PHASE 1 PLAN]

---

**Status**: ✅ Ready for execution  
**Next**: Run `npm run atlas:phase0:all:dry` to audit all blockers
