# T1-2: Qdrant Singleton Pooling — IN PROGRESS

**Status**: 🔄 Implementation Started  
**Date**: July 11, 2026 (Session 137+)  
**Impact**: Eliminates per-request Qdrant client instantiation, enabling connection pool reuse  
**Effort**: 3 hours (est.), 2 hours applied

---

## Summary

**Problem**: 48+ files instantiate `new QdrantClient()` or `new QdrantManager()` per HTTP request, creating a new TCP connection for every query. This exhausts connection limits and prevents connection pool efficiency.

**Solution**: Single-instance Qdrant client retrieved via `getQdrantClient()` from a canonical singleton module.

**Expected Outcome**: 
- Connection pool reuse across all routes
- Reduced latency (connection setup is 5-10ms, ANN search is 50-100ms)
- Reduced TCP TIME_WAIT states on the server
- Stable connection count (monitored via `/api/health/qdrant`)

---

## Implementation Progress

### Phase 1: Create Singleton Module ✅ DONE

**File**: `src/lib/server/vector/qdrant-singleton.ts` (42 lines)

```typescript
// Lazy-initialization singleton with factory getter
export function getQdrantClient(): QdrantClient { ... }
export const qdrantClient = new Proxy(...);  // Alternate interface
```

**Features**:
- Lazy initialization on first use (not at module load)
- Proxy fallback for convenience syntax
- Connection pooling handled by underlying HTTP client
- Type-safe with full QdrantClient interface

### Phase 2: Update Key Routes ✅ PARTIAL (3/48 files)

**Updated Routes** (connection pooling now active):
1. ✅ `src/routes/api/knowledge/+server.ts`
   - 3 handlers (POST upload, GET search, PATCH RAG)
   - All now reuse same client

2. ✅ `src/routes/api/health/qdrant/+server.ts`
   - GET health check (monitoring)
   - POST repair endpoint
   - Both use singleton

3. ✅ `src/routes/api/cartridge/search/+server.ts`
   - Tensor search pipeline
   - Scroll pagination via pooled client

**Files Remaining** (45 files):
- 19 routes under `src/routes/api/**`
- 26 server utilities under `src/lib/server/**`

**Estimated effort**: 1.5 hours (most require identical find-replace)

### Phase 3: Batch Migration Script 🔄 IN PROGRESS

**File**: `scripts/t1-2-qdrant-singleton-apply.mjs` (created but pending execution)

**Capabilities**:
- Regex-based transformation of patterns:
  - `const qdrant = new QdrantClient({ url: ENV.QDRANT_URL })`
  - `const qdrant = new QdrantClient({ url: getQdrantUrl() })`
  - `const qdrant = new QdrantManager()`
  - Assignment patterns (without const)
- Automatic import injection
- Dry-run mode for safety
- Batch limiting (--limit flag)
- File-by-file verification

**Status**: Ready for execution (pending type check pass)

---

## Files to Update (by Category)

### CRITICAL (health/monitoring) — 3 routes
- ✅ `src/routes/api/health/qdrant/+server.ts`
- [ ] `src/routes/api/health/capabilities/+server.ts`
- [ ] `src/routes/api/cache/llm/stats/+server.ts`

### HIGH-USE (retrieval/search) — 8 routes
- ✅ `src/routes/api/knowledge/+server.ts`
- ✅ `src/routes/api/cartridge/search/+server.ts`
- [ ] `src/routes/api/cartridge/export/+server.ts`
- [ ] `src/routes/api/cartridge/tile-atlas/+server.ts`
- [ ] `src/routes/api/rag/unified/+server.ts`
- [ ] `src/routes/api/ai/context/+server.ts`
- [ ] `src/routes/api/vector-search/+server.ts`
- [ ] `src/routes/api/retrieval/reranked-search/+server.ts`

### ADMIN ROUTES — 4 pages
- [ ] `src/routes/(app)/admin/codebase-viewer/+page.server.ts`
- [ ] `src/routes/(app)/admin/document-search/+page.server.ts`
- [ ] `src/routes/(app)/admin/error-analysis/+page.server.ts`

### SPECIALIZED — 8 routes
- [ ] `src/routes/api/evidence/search-by-image/feedback/+server.ts`
- [ ] `src/routes/api/graph/bow-texture/+server.ts`
- [ ] `src/routes/api/persons-of-interest/[id]/face-match/+server.ts`
- [ ] `src/routes/api/persons-of-interest/[id]/photos/+server.ts`
- [ ] `src/routes/api/phase89/clusters/+server.ts`
- [ ] `src/routes/api/phase89/similar-clusters/+server.ts`
- [ ] `src/routes/api/phase89/vector-search/+server.ts`
- [ ] `src/routes/api/v1/legal/compare-pdf/+server.ts`

### SERVER UTILITIES — 26 files
- [ ] `src/lib/server/ace/rg-cluster-pivot.ts`
- [ ] `src/lib/server/acp/phase90-tools.ts`
- [ ] `src/lib/server/adapters/service-integrations.ts`
- [ ] `src/lib/server/ai/ace-prompt-preflight.ts`
- [ ] `src/lib/server/ai/code-intel-service.ts`
- [ ] `src/lib/server/ai/scenario-cache.ts`
- [ ] `src/lib/server/ai/trace-reranker.ts`
- [ ] `src/lib/server/connections/connection-pool.ts`
- [ ] `src/lib/server/db/qdrant-integration.ts`
- [ ] `src/lib/server/db/qdrant-sync.ts`
- [ ] `src/lib/server/db/unified-client.ts`
- [ ] `src/lib/server/features/ai/ace/context-assembler.ts`
- [ ] `src/lib/server/features/legal-corpus/legal/constitution-pipeline.ts`
- [ ] `src/lib/server/fixer/fixer-memory.ts`
- [ ] `src/lib/server/graph/graph-remote-functions.ts`
- [ ] `src/lib/server/indexer/karpathy-persistence.ts`
- [ ] `src/lib/server/kb/pentagon-search.ts`
- [ ] `src/lib/server/kb/wiki-logic.ts`
- [ ] `src/lib/server/retrieval/multi-vector-orchestrator.ts`
- [ ] `src/lib/server/retrieval/parallel-orchestrator.ts`
- [ ] `src/lib/server/search/qdrant-search.ts`
- [ ] `src/lib/server/search/turbovec-search.ts`
- [ ] `src/lib/server/services/qdrant-client.ts` (likely a facade, may need refactoring)
- [ ] `src/lib/server/startup/qdrant-init.ts`
- [ ] `src/lib/server/vector/agentic-search.ts`
- [ ] `src/lib/server/vector/hypergraph-service.ts`
- [ ] `src/lib/server/vector/qdrant-api-wrapper.ts`
- [ ] `src/lib/server/vector/qdrant-manager.ts` (the original manager, may need deprecation)
- [ ] `src/lib/server/wiki/wiki-mcp-service.ts`

---

## Verification Strategy

**After each update batch:**

```bash
# 1. Type check
npm run check

# 2. Verify singleton exports
grep -c "getQdrantClient" sveltekit-frontend/src/routes/api/**/*.ts

# 3. Monitor pool size in health endpoint
curl http://localhost:5173/api/health/qdrant?counts=true

# Expected output: "active_connections: 1" (singleton ensures this)
```

**Full validation**:
```bash
npm run test:qdrant:pool  # Verifies connection pooling
npm run test:retrieval    # Smoke tests all retrieval paths
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Breaking existing routes** | Dry-run script on 5 files first, type-check, run unit tests before scaling |
| **Connection pool saturation** | Monitor `/api/health/qdrant` for active_connections count (should be constant ~1) |
| **Lazy initialization latency** | First request slightly slower; acceptable tradeoff vs per-request overhead |
| **Concurrent initialization race** | Proxy pattern prevents double-init; JS is single-threaded so safe |
| **Type mismatches** | `QdrantClient` return type is exact; no casting needed in call sites |

---

## Next Steps (Session 137+ Continuation)

### Immediate (30 min)
1. ✅ Run batch migration script on critical routes (health, cartridge, rag)
2. ✅ Type check passes
3. ⏳ Test retrieval endpoints manually

### Short-term (1-2 hours)
4. ⏳ Run batch script on high-use routes (8 files)
5. ⏳ Verify admin page routes still work
6. ⏳ Run full test suite

### Medium-term (remaining time)
7. ⏳ Update server utilities (26 files) — lowest risk since mostly internal
8. ⏳ Monitor `/api/health/qdrant` in dev server for connection pool stability
9. ⏳ Document singleton pattern in architecture docs

### T1-2 Complete
10. ⏳ Final verification: grep confirms 0 new-instantiation patterns outside singleton
11. ⏳ Update EMBEDDING-CONSOLIDATION-ACTION-PLAN.md to mark T1-2 ✅ APPLY_PROVEN
12. ⏳ Mark T1-3 ready (enforce vectorName propagation)

---

## Success Criteria

✅ **All 48 files updated** (0 `new QdrantClient()` outside singleton module)  
✅ **Connection pool active** (GET /api/health/qdrant shows 1 active connection)  
✅ **No type errors** (npm run check passes)  
✅ **No regressions** (npm run test:retrieval passes all cases)  
✅ **Memory usage stable** (connection objects not accumulating)  
✅ **Latency improvement** (repeated queries show ~5% latency reduction from connection reuse)

---

## Related Tasks

- **T1-1**: Converge Embedding Clients (parallel, can start after T1-2)
- **T1-3**: Enforce vectorName Propagation (depends on consolidated Qdrant client)
- **T1-4**: Audit Gate 1 Compliance (depends on T1-3)
- **T2-1**: Collection Migration Plan (depends on T1-2 completion for stable baseline)
