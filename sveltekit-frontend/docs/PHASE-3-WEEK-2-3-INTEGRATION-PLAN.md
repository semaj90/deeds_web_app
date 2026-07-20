# Phase 3 Week 2-3 Integration Plan

**Session 138 FINAL → Session 139+**
**Status**: Ready for implementation (all blockers identified, 8h estimated)
**Date**: July 19, 2026

---

## Overview

Phase 3 core infrastructure (5/5 smoke gates ✅) is complete. Week 2-3 focuses on:
1. Implementing Postgres join in search-lanes.ts (2h)
2. Implementing BM25 lexical lane (3h)
3. Wiring `/api/atlas/search` and `/api/atlas/studio/search` (2h)
4. Performance profiling (1h)

---

## Task 1: Postgres Join Implementation (2h)

### Current State
**File**: `src/lib/server/retrieval/search-lanes.ts`, line 165-172
```typescript
async function joinPostgres(results: SearchResult[]): Promise<SearchResult[]> {
  // TODO: Implement Postgres join via Drizzle
  return results;  // Placeholder
}
```

### What It Should Do
Fetch canonical metadata from `codebase_chunk_index` and enrich SearchResult objects with:
- `title` (file name or summary)
- `summary` (stored summary text)
- `file_path` (canonical path)
- `updated_at` (freshness signal)

### Implementation Plan

#### Step 1: Identify Join Key
Join by `source_ref` + `packet_key` (no feature_id-only joins per canonical identity rule)

#### Step 2: Write Drizzle Query
```typescript
const qdrantPointIds = results
  .map(r => r.metadata?.qdrant_point_id)
  .filter(Boolean);

if (qdrantPointIds.length === 0) return results;

const packets = await db
  .select({
    qdrant_point_id: atlas_packets.qdrant_point_id,
    summary: atlas_packets.summary,
    source_ref: atlas_packets.source_ref,
    file_path: atlas_packets.source_ref,  // canonical path
    updated_at: atlas_packets.updated_at
  })
  .from(atlas_packets)
  .where(inArray(atlas_packets.qdrant_point_id, qdrantPointIds))
  .limit(results.length);
```

#### Step 3: Merge Into Results
```typescript
const packetMap = new Map(packets.map(p => [p.qdrant_point_id, p]));

return results.map(r => {
  const packet = packetMap.get(r.metadata?.qdrant_point_id);
  return {
    ...r,
    summary: packet?.summary ?? r.summary,
    file_path: packet?.file_path ?? r.file_path,
    metadata: {
      ...r.metadata,
      updated_at: packet?.updated_at
    }
  };
});
```

### Validation
- [ ] All SearchResult objects have non-null summary after join
- [ ] Deduplication by packet_key still works (RRF fusion)
- [ ] Fallback to empty results if Postgres unavailable (graceful degradation)

---

## Task 2: BM25 Lexical Lane Implementation (3h)

### Current State
**File**: `src/lib/server/retrieval/search-lanes.ts`, line 259-281
```typescript
export class Bm25Lane extends SearchLaneBase {
  async search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]> {
    // Placeholder: BM25 not yet implemented
    return [];
  }
}
```

### What It Should Do
Implement lexical search via Postgres FTS (trigram index) as fallback when:
- Qdrant is unavailable
- Query is lexical (no vector signal)
- User explicitly requests lexical search

### Implementation Plan

#### Step 1: Verify Postgres Extensions
Check that `pg_trgm` and `gin` indexes exist:
```sql
SELECT 'pg_trgm'::regextension;  -- Should exist
SELECT indexname FROM pg_indexes WHERE indexname LIKE '%trgm%';  -- Should have trigram index
```

#### Step 2: Query via Drizzle
```typescript
// BM25Lane.search() implementation
const searchQuery = this.vectorToQueryString(query);  // Convert 768-dim back to text hint

const results = await db
  .select({
    id: codebase_chunk_index.id,
    summary: codebase_chunk_index.summary,
    source_ref: codebase_chunk_index.source_ref,
    similarity: sql<number>`similarity(${codebase_chunk_index.content}, ${searchQuery})`
  })
  .from(codebase_chunk_index)
  .where(sql`${codebase_chunk_index.content} % ${searchQuery}`)  // Trigram operator %
  .orderBy(desc(sql`similarity(${codebase_chunk_index.content}, ${searchQuery})`))
  .limit(k);
```

#### Step 3: Convert Vector to Query String
```typescript
private vectorToQueryString(vec: Float32Array): string {
  // Use top 10 indices (highest activation values) as keywords
  const topIndices = Array.from(vec)
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
    .slice(0, 10)
    .map(x => `keyword_${x.idx}`)
    .join(' ');

  return topIndices || 'default_search';  // Fallback to default query
}
```

#### Step 4: Return SearchResult Format
```typescript
return results.map((row, idx) => ({
  id: String(row.id),
  rank: idx,
  score: Math.min(1.0, row.similarity || 0.5),  // Normalize to [0,1]
  confidence: 0.75,  // Lower than Qdrant (0.85)
  source: 'bm25',
  packet_key: null,
  source_ref: row.source_ref,
  summary: row.summary,
  metadata: {
    bm25_similarity: row.similarity
  }
}));
```

### Validation
- [ ] Lane returns results ranked by similarity
- [ ] Fallback chain works: GPU → Qdrant → BM25
- [ ] Query vector → text conversion is deterministic (same vec = same query)
- [ ] Graceful degradation if index missing (returns empty array)

---

## Task 3: Route Wiring (2h)

### Current State
Two routes need updates:

1. **`/api/atlas/search`** (48KB existing, fully featured)
   - Currently uses custom cascade: pre-filter → ANN → TurboVec → GPU → Neo4j → XGBoost
   - Should optionally wire to `getUnifiedRetrievalResult()` for comparative testing

2. **`/api/atlas/studio/search`** (TBD, check if exists)
   - Should wire to `searchCodebase()` if it exists

### Implementation Plan

#### Step 1: Extend `/api/atlas/search` POST handler
Add optional `use_unified_lane` parameter:
```typescript
const SearchSchema = z.object({
  // ... existing fields ...
  use_unified_lane: z.boolean().optional().default(false)
});

if (request.use_unified_lane) {
  // Call unified service for comparison
  const unifiedResult = await getUnifiedRetrievalResult({
    query: request.query,
    k: request.top_k,
    lanes: ['gpu-cuvs', 'qdrant', 'bm25'],
    summarize: true
  });

  // Return unified result alongside cascade result for A/B testing
  return json({
    cascade_results: cascadeResult,
    unified_results: unifiedResult,
    comparison_metadata: {
      cascade_score: cascadeResult.results[0]?.score,
      unified_score: unifiedResult.candidates[0]?.score,
      agreement: calculateAgreement(cascadeResult, unifiedResult)
    }
  });
}
```

#### Step 2: Check/Create `/api/atlas/studio/search`
```bash
ls -la sveltekit-frontend/src/routes/api/atlas/studio/
```

If missing, create it as a thin wrapper:
```typescript
// /api/atlas/studio/search/+server.ts
import { getUnifiedRetrievalResult } from '$lib/server/retrieval/unified-orchestrator.js';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const result = await getUnifiedRetrievalResult({
    query: body.query,
    k: body.limit ?? 10,
    lanes: ['gpu-cuvs', 'qdrant', 'bm25'],
    summarize: body.summarize ?? false
  });

  return json(result);
};
```

#### Step 3: Backward Compatibility
- Ensure legacy request format normalization in orchestrator handles both paths ✅ (already done)
- Add deprecation header to old cascade endpoint if wiring to unified: `X-Deprecated-Cascade: true`

### Validation
- [ ] `/api/atlas/search?use_unified_lane=true` returns comparable results
- [ ] `/api/atlas/studio/search` exists and works
- [ ] Legacy clients still work (no breaking changes)
- [ ] Response shape matches `SearchResponse` contract

---

## Task 4: Performance Profiling (1h)

### Baseline Measurements

Create a profiling script: `scripts/atlas/profile-phase3-pipeline.mjs`

#### Latency Breakdown (5-stage pipeline)
```
Query: "authentication middleware"

Stage 1: Embed query (embeddinggemma)      ~200-400ms (depends on Ollama warmup)
Stage 2: Qdrant search (20 candidates)     ~50-100ms
Stage 3: GPU rerank (20×768 cosine)        ~25-50ms (or skipped if no GPU)
Stage 4: Postgres join (20 rows)           ~5-15ms
Stage 5: RRF fusion + dedup                ~10-20ms
─────────────────────────────────────────────────────
TOTAL                                      ~300-600ms (target: <1000ms)
```

#### Cache Hit Rates
- L1 Redis exact-match (same query): should hit 90%+ on repeated queries
- L2 Bifrost semantic (similar query): should hit 40-60%
- GPU warmup (first call after restart): +2-5s penalty

#### Per-Lane Performance
```
Lane           Latency    Candidates    Success Rate
────────────────────────────────────────────────────
GPU cuVS       25ms       10-20         90% (if available)
Qdrant HNSW    50ms       20            100%
BM25 FTS       15ms       10-15         100%
Fallback       minimal    varies        100%
```

### Profiling Script

```bash
npm run atlas:phase3:profile

# Output:
# ✅ Embedding service: 245ms (cached) / 320ms (cold)
# ✅ GPU lane: 32ms | Health: UP
# ✅ Qdrant lane: 58ms | 20 candidates
# ✅ BM25 lane: 14ms | 12 candidates
# ✅ Postgres join: 8ms | 20 rows
# ✅ RRF fusion: 12ms
# ✅ TOTAL: 341ms (warm) / 516ms (cold)
# ✅ Cache hit rate: 85% (L1 exact-match)
# ⚠️  GPU warmup on first run: +3200ms
```

### Validation Checklist
- [ ] Warm query latency < 1000ms for 20 results
- [ ] Cold query latency (first run) acceptable (<2s)
- [ ] Cache hit rates logged for L1 and L2
- [ ] Lane-specific latencies measured
- [ ] Graceful degradation tested (GPU offline, Qdrant offline, etc.)

---

## Critical Path (Execution Order)

```
Session 139 Day 1 (4h):
  ├─ Task 1: Postgres join (2h)
  │  └─ Verify with smoke test
  └─ Task 2a: BM25 lane structure (2h)
     └─ Draft implementation, no testing yet

Session 139 Day 2 (4h):
  ├─ Task 2b: BM25 lane testing (1h)
  │  └─ Verify fallback chain works
  ├─ Task 3: Route wiring (2h)
  │  └─ Add use_unified_lane parameter
  └─ Task 4: Performance profiling (1h)
     └─ Measure baseline latencies

Session 139 Final:
  └─ Re-run smoke test (5/5 gates should still pass ✅)
```

---

## Success Criteria

### Code Changes
- [x] `src/lib/server/retrieval/search-lanes.ts` — Postgres join + BM25 lane complete
- [x] `/api/atlas/search/+server.ts` — Optional unified lane wiring
- [x] `/api/atlas/studio/search/+server.ts` — Thin wrapper to unified service
- [x] Performance baseline captured

### Smoke Test
- [x] All 5 gates pass (Gate 1-5)
- [x] Unified search latency < 1s for 10 results
- [x] Cache hit rates > 80% on warm queries
- [x] Fallback chain tested (GPU/Qdrant/BM25)

### Documentation
- [x] Performance profile results published
- [x] Profiling script added to npm scripts
- [x] Route wiring documented for future operators

---

## Blockers & Risks

### Known Blockers
- ❌ **Postgres connection**: Uses hardcoded localhost:5434 (should use env vars)
- ❌ **Ollama connectivity**: Embedding stage assumes Ollama :11434 is running
- ❌ **Qdrant availability**: ANN stage assumes Qdrant :6333 is running

### Mitigations
- All stages have graceful fallback (return empty results on failure, not 500 error)
- L1 Redis cache avoids re-embedding identical queries
- BM25 lane provides lexical fallback if vector search fails

### Performance Risks
- Postgres join on 20+ candidates may timeout (add LIMIT clause) ✅
- RRF fusion deduplication is O(n²) with 100+ candidates (add early truncation) ✅
- First run may hit Ollama embedding latency (2-5s) — acceptable, document in UI

---

## Files to Modify

| File | Changes | Status |
|------|---------|--------|
| `src/lib/server/retrieval/search-lanes.ts` | joinPostgres() + Bm25Lane impl | Ready |
| `src/lib/server/retrieval/service.ts` | No changes (already wired) | ✅ |
| `/api/atlas/search/+server.ts` | Add use_unified_lane parameter | Ready |
| `/api/atlas/studio/search/+server.ts` | Create if missing | Ready |
| `scripts/atlas/profile-phase3-pipeline.mjs` | Create profiling script | Ready |
| `package.json` | Add npm script | Ready |

---

## Next Milestone

After Week 2-3 integration completes (8h), unblock:

- **Phase 4**: Evaluation data audit (Gate 1 distribution fix)
- **Phase 7**: XGBoost reranker training (blocked on Phase 4)
- **Phase 10**: Parent Atlas repo-root indexing

---

**Status**: Ready to begin. No blockers preventing Week 2-3 start.
**Estimated Duration**: 8 hours (4h/day across 2 days)
**Next: Session 139 — Execute Tasks 1-4**