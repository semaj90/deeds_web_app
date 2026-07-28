# Session 148 Continuation Summary — workspace_id + Sparse Vector Naming (2026-07-28)

**Status**: ✅ COMPLETE | workspace_id resolved | Sparse vector naming normalized | All files updated

## Changes Completed

### 1. workspace_id Resolution

**Question**: "workspace_id is derived from timestamp or repo directory? metadata indexing?"

**Answer**: Auto-derived from **environment or snapshot timestamp**

**Implementation**:
- Added to `build-vector-index-lanes.mts` makeQdrantPayload()
- Formula: `snapshot-phase12-{date}` (e.g., `snapshot-phase12-2026-07-28`)
- Environment override: `ATLAS_WORKSPACE_ID` env var
- Deterministic per calendar day (enables snapshot isolation)

**Result**: ✅ Qdrant payload validation now PASSES

### 2. Sparse Vector Naming Normalization

**Before (inconsistent)**:
- Contract spec: `bm42`
- Scripts: `bm42_sparse`
- Parent-atlas registry: `bm42_sparse`
- SvelteKit semantics: `bm42_sparse`

**After (canonical)**:
- All sources: `bm42` ✅

**Files Updated**:
1. `scripts/atlas/duckdb/build-vector-index-lanes.mts` (line 62)
   ```typescript
   const QDRANT_SPARSE_VECTOR = 'bm42'; // was 'bm42_sparse'
   ```

2. `packages/parent-atlas/src/core/qdrant-collection-registry.ts` (line 14)
   ```typescript
   export const QDRANT_SPARSE_VECTOR_NAME = 'bm42' as const; // was 'bm42_sparse'
   ```

3. `sveltekit-frontend/src/lib/server/vector/retrieval-semantics.ts` (line 9)
   ```typescript
   export const QDRANT_SPARSE_VECTOR_NAME = 'bm42' as const; // was 'bm42_sparse'
   ```

**Result**: ✅ Script now requests correct sparse vector name from Qdrant

### 3. Documentation Updates

**New Files**:
- `docs/QDRANT-RERANKING-CAPABILITIES-2026-07-28.md` (550+ lines)
  - Qdrant's built-in RRF (Reciprocal Rank Fusion)
  - Sparse vector details (BM42)
  - GPU reranking (LibTorch)
  - Phases 13-16 roadmap
  - Canonical naming conventions

**Updated Files**:
- `CLAUDE.md` — added "Qdrant Payload workspace_id Convention" section
- `docs/PHASE-12-EXECUTION-RESULTS-2026-07-28.md` — Stage 4 status updated
- `docs/PHASE-12-FINAL-STATUS-2026-07-28.md` — comprehensive final status with all fixes
- `scripts/atlas/duckdb/build-vector-index-lanes.mts` — added Qdrant schema requirement note

---

## Outstanding Issue (Phase 15+ scope)

**Current State**:
- Payload validation: ✅ FIXED
- Sparse vector naming: ✅ NORMALIZED
- Qdrant upsert: ❌ BLOCKED (sparse vector schema missing in collection)

**Error** (if --apply used):
```
Error: Qdrant PUT .../points?wait=true -> 400:
Not existing vector name error: bm42
```

**Why**: Qdrant collection `codebase_chunks_384_hybrid` was created without sparse vectors.

**Solutions**:
1. **Skip Qdrant upsert (RECOMMENDED)**: Phase 12 snapshots complete without it
2. **Create sparse vectors in Qdrant** (Phases 15+): Wire sparse vector definitions
3. **Defer index lanes entirely** (Phases 15+): Full pipeline integration later

---

## Qdrant Architecture (Documented)

### Native Capabilities
- **RRF (Reciprocal Rank Fusion)**: Combines dense (Cosine) + sparse (BM42) → single ranked result
- **Payload Filtering**: Use workspace_id, ontology_version, etc. as retrieval filters
- **Named Vectors**: Multiple dense vector spaces (content, summary, etc.)
- **Sparse Vectors**: BM42 (inverted index, ~1-5ms per 1M docs)

### Hybrid Search Flow
```
Query
  ↓
Embed (384-dim)
  ↓
Qdrant Hybrid Search
  ├─ Dense: content vector (HNSW, Cosine)
  ├─ Sparse: bm42 (inverted index, BM25-like)
  └─ Fusion: RRF combines → unified score
  ↓
Optional GPU Rerank (LibTorch attention)
  ↓
Final Results
```

### Post-Query Reranking (Optional)
- **LibTorch**: GPU attention scores (25-50ms for top-50)
- **Pattern**: Skip if RRF already ranks well (<0.1 score spread)
- **Use**: Complex multi-intent queries benefit from attention boosting

---

## Canonical References Updated

**qdrant-collection-contracts.ts** (source of truth):
```typescript
const SHARED_INDEXED_PAYLOAD_FIELDS = {
  packet_key: 'keyword',
  source_ref: 'keyword',
  workspace_id: 'keyword',    // Phase 12: populated
  ontology_version: 'keyword', // Phase 12: '1.0'
  // ... other fields
};

codebase_chunks_384_hybrid: {
  vectors: {
    content: { size: 384, distance: 'Cosine' },
    summary: { size: 384, distance: 'Cosine' },
  },
  sparseVectors: {
    bm42: {}, // canonical name
  },
  // ... requiredPayloadFields, indexedPayloadFields
}
```

All three referencing files now use `'bm42'` consistently.

---

## Phase 12 Status

**Core Snapshots**: ✅ PRODUCTION-READY
- Domain: 52K rows + 44K training splits
- Vector: 5K × 384-dim (Parquet)
- Full corpus: 61K packets
- All pass CWD validation (no cross-directory issues)

**Index Lanes**: ⏳ SCHEMA PENDING
- Payload validation: ✅ Fixed
- Sparse vector naming: ✅ Normalized
- Collection schema: ❌ Requires sparse vector definitions (Phase 15+)

**Execution**: `npm run atlas:duckdb:snapshot:5k` (all stages pass without --apply)

---

## Phases 13-16 Roadmap

| Phase | Task | Blocking? |
|-------|------|-----------|
| **13** | K-means clustering (384-dim) | No, can run now with snapshots |
| **14** | SOM topology (20×20 grid) | No, can run now with snapshots |
| **15** | Qdrant enrichment (sparse, workspace_id backfill) | Yes for full Qdrant wiring |
| **16** | ACE context assembly | No, independent of Qdrant |

---

## Summary

✅ **What was done**:
1. Resolved workspace_id requirement (auto-derived from timestamp)
2. Normalized sparse vector naming across all files (`bm42_sparse` → `bm42`)
3. Documented Qdrant's native RRF and reranking capabilities
4. Updated all relevant scripts, registries, and docs

✅ **Current state**:
- Phase 12 snapshots: production-ready
- Qdrant payload: validation passes
- Sparse vector naming: canonical and consistent

⏳ **Phases 15+ work**:
- Add sparse vector schema to Qdrant collection
- Backfill workspace_id to existing points (if needed)
- Wire full index lanes into retrieval pipeline

**Files updated**: 3 scripts + 4 docs = 7 files total
**No breaking changes**: All modifications are backward-compatible or additive
**Testing**: DuckDB snapshots re-verified (all 3 stages pass)

---

**Last Updated**: 2026-07-28  
**Session**: 148 Continuation  
**Status**: COMPLETE
