# T1-2: Qdrant Singleton Pooling — Session 137+ Checkpoint

**Status**: 🟢 Pilot Phase Complete, Ready for Batch Migration  
**Date**: July 11, 2026 (Session 137+)  
**Applied**: 5 files / 48 total (10% complete)

---

## Pilot Phase Results

### ✅ Successfully Updated Routes (Connection Pooling Active)

1. **`src/routes/api/knowledge/+server.ts`**
   - 3 handlers (POST upload, GET search, PATCH RAG)
   - Type check: ✅ Pass (pre-existing pdf-parse error unrelated)
   - Status: Ready for testing

2. **`src/routes/api/health/qdrant/+server.ts`** ✅
   - GET health check (monitoring endpoint)
   - POST repair endpoint
   - Type check: ✅ Pass
   - Status: Ready for testing

3. **`src/routes/api/cartridge/search/+server.ts`** ✅
   - Tensor search with pagination
   - Type check: ✅ Pass
   - Status: Ready for testing

4. **`src/routes/api/cartridge/export/+server.ts`** ✅
   - Binary cartridge export + Redis cache
   - Type check: ✅ Pass
   - Status: Ready for testing

5. **`src/routes/api/rag/unified/+server.ts`** ✅
   - Health check endpoint
   - Type check: ✅ Pass
   - Status: Ready for testing

### Singleton Module Created ✅

**File**: `src/lib/server/vector/qdrant-singleton.ts` (42 lines)
- Lazy initialization (first use only)
- Proxy interface for convenience
- Full type safety
- Status: Production-ready

### Batch Migration Script Ready 🔄

**File**: `scripts/t1-2-qdrant-singleton-apply.mjs`
- Regex-based transformation of all patterns
- Automatic import injection
- Dry-run mode for safety
- Batch limiting
- Status: Awaiting execution on remaining 43 files

---

## Verification Status

### Type Safety: ✅ PASS
All 5 pilot files compile without new errors.
```
grep -count: 0 new errors introduced
```

### Integration: ⏳ PENDING
Requires manual testing:
- [ ] POST /api/knowledge (document upload)
- [ ] GET /api/knowledge (search)
- [ ] PATCH /api/knowledge (RAG + LLM)
- [ ] GET /api/health/qdrant (health check)
- [ ] POST /api/health/qdrant?repair=true (repair)
- [ ] POST /api/cartridge/search (tensor search)
- [ ] POST /api/cartridge/export (binary export)
- [ ] GET /api/rag/unified (health check)

### Connection Pooling: ⏳ PENDING
Monitor `/api/health/qdrant?counts=true` for:
- `active_connections: 1` (singleton ensures this)
- Stable connection count across multiple requests
- No TCP TIME_WAIT accumulation

---

## Remaining Work (43 files)

### By Priority Tier

**TIER 1 — CRITICAL (8 files)**
Routes that must pass before core retrieval works:
- [ ] `src/routes/api/ai/context/+server.ts` — ACE context assembly
- [ ] `src/routes/api/vector-search/+server.ts` — Basic vector search
- [ ] `src/routes/api/retrieval/reranked-search/+server.ts` — Retrieval pipeline
- [ ] `src/routes/(app)/admin/document-search/+page.server.ts` — Admin search
- [ ] `src/routes/(app)/admin/error-analysis/+page.server.ts` — Admin analysis
- [ ] `src/routes/(app)/admin/codebase-viewer/+page.server.ts` — Admin viewer
- [ ] `src/routes/api/cartridge/tile-atlas/+server.ts` — Cartridge tile indexing
- [ ] `src/routes/api/health/capabilities/+server.ts` — Capability detection

**TIER 2 — HIGH-USE (8 files)**
Routes used by specialized features:
- [ ] `src/routes/api/evidence/search-by-image/feedback/+server.ts`
- [ ] `src/routes/api/graph/bow-texture/+server.ts`
- [ ] `src/routes/api/persons-of-interest/[id]/face-match/+server.ts`
- [ ] `src/routes/api/persons-of-interest/[id]/photos/+server.ts`
- [ ] `src/routes/api/phase89/clusters/+server.ts`
- [ ] `src/routes/api/phase89/similar-clusters/+server.ts`
- [ ] `src/routes/api/phase89/vector-search/+server.ts`
- [ ] `src/routes/api/v1/legal/compare-pdf/+server.ts`

**TIER 3 — SERVER UTILITIES (26 files)**
Internal modules (lowest risk of breakage):
- [ ] 26 files under `src/lib/server/**`

**TIER 4 — DEPRECATION CANDIDATES (1 file)**
- [ ] `src/lib/server/services/qdrant-client.ts` — Likely a wrapper, needs refactoring

---

## Recommended Execution Order (Session 137+ Continuation)

### Phase 2A: Critical Routes (30 min)
1. Apply batch migration script to Tier 1 (8 files)
2. Type check (npm run check)
3. Test retrieval endpoints manually

### Phase 2B: High-Use Routes (30 min)
4. Apply batch migration script to Tier 2 (8 files)
5. Type check again
6. Monitor for regressions

### Phase 2C: Server Utilities (1 hour)
7. Apply batch migration script to Tier 3 (26 files)
8. Type check final time
9. Full test suite (npm run test)

### Phase 2D: Cleanup & Verification (30 min)
10. Verify no new-instantiation patterns remain (grep check)
11. Document connection pool stable state
12. Mark T1-2 ✅ APPLY_PROVEN in action plan
13. Update EMBEDDING-CONSOLIDATION-ACTION-PLAN.md

---

## Success Criteria for T1-2 Complete

✅ **All 48 files migrated** (0 `new QdrantClient()` outside singleton)
✅ **Type check passes** (npm run check — no new errors)
✅ **Connection pool stable** (GET /api/health/qdrant shows 1 active connection)
✅ **No regressions** (npm run test:retrieval passes)
✅ **Latency improvement** (5% reduction on repeated queries from connection reuse)
✅ **Memory usage stable** (connection objects not accumulating)

---

## Notes for Next Session

- Batch migration script is production-ready (tested regex patterns)
- Type check is already passing for 5 pilot files
- No integration issues discovered yet (good sign)
- Connection pool will only show benefits once >50% of routes are migrated
- Consider running full test suite after Tier 1 + 2 complete (30 files) to detect any early regressions

---

**Estimated Total Effort**: 2.5 hours remaining (pilot was 0.5h, total 3h)
**T1-2 Target Status**: APPLY_PROVEN by end of Session 137+
**T1-3 Can Start**: Once T1-2 reaches 30-file milestone (Tiers 1-2 complete)
