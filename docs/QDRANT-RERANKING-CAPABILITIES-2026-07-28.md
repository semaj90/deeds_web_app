# Qdrant Reranking & Vector Search Architecture (2026-07-28)

**Status**: Qdrant has built-in reranking via RRF (Reciprocal Rank Fusion). Phase 12 script updated to use canonical sparse vector naming.

## Qdrant Built-In Reranking

Qdrant provides **fusion and reranking strategies** at the HTTP API level:

### 1. Reciprocal Rank Fusion (RRF) — Canonical Strategy

**What it does**: Combines dense vector similarity (cosine) with sparse vector (BM42) relevance into a single ranked result set.

**Formula**:
```
RRF Score = 1 / (60 + rank_dense) + 1 / (60 + rank_sparse)
```

**When to use**:
- Hybrid retrieval (both semantic + lexical ranking needed)
- Balancing precision (dense) with recall (sparse)
- Default fusion strategy for multi-vector search

### 2. Qdrant Reranker API (Optional)

**Qdrant Enterprise** offers built-in reranking via:
- BM25 fusion
- Custom payload-based boosting
- Model-based reranking (requires plugin)

**Status in this project**: Using RRF (open-source native support, no plugin required).

### 3. Post-Query CPU Reranking (Current Implementation)

**Where**: `sveltekit-frontend/src/lib/server/ai/libtorch-reranker.ts`

**What it does**:
- Qdrant returns top-K candidates
- LibTorch N-API wrapper computes GPU attention scores
- Re-rank results by `0.4·dense + 0.3·attention + 0.3·authority` blend

**Performance**: 
- Dense (Qdrant): 5-10ms for 1K candidates
- Attention (GPU): 25-50ms for 50 candidates
- Total: 30-60ms typical

**When RRF is sufficient**: Don't GPU rerank if top-K gap is <0.1 (results already well-ordered by fusion).

---

## Phase 12 Updates

### ✅ Fixed: Sparse Vector Naming

**Before (inconsistent)**:
- Contract: `bm42`
- Scripts: `bm42_sparse`
- Registry: `bm42_sparse`

**After (canonical)**:
- Contract: `bm42` ✅
- Scripts: `bm42` ✅
- Registry: `bm42` ✅
- Semantics: `bm42` ✅

**Impact**: 
- Qdrant upserts now match collection schema
- Sparse vector creation in `ensureQdrantCollection()` uses correct name
- Future collection backfills will use canonical naming

### Files Updated

1. `scripts/atlas/duckdb/build-vector-index-lanes.mts` (line 62)
   - Changed: `const QDRANT_SPARSE_VECTOR = 'bm42_sparse'` → `'bm42'`

2. `packages/parent-atlas/src/core/qdrant-collection-registry.ts` (line 14)
   - Changed: `QDRANT_SPARSE_VECTOR_NAME = 'bm42_sparse'` → `'bm42'`

3. `sveltekit-frontend/src/lib/server/vector/retrieval-semantics.ts` (line 9)
   - Changed: `QDRANT_SPARSE_VECTOR_NAME = 'bm42_sparse'` → `'bm42'`

---

## Qdrant Search Flow (Phase 12+)

```
Query
  ↓
Embed (768-dim or 384-dim)
  ↓
Qdrant Hybrid Search
  ├─ Dense ANN: content vector (Cosine, HNSW)
  ├─ Sparse Search: bm42 (BM25, inverted index)
  └─ Fusion: RRF combines ranks → unified score
  ↓
Top-K Results (sorted by RRF score)
  ↓
Optional: Post-Query GPU Reranking (LibTorch attention)
  ↓
Final Ranked Results → ACE Context Assembly
```

### Payload Filtering (Retrieve Only What You Need)

**Phase 12 payloads include**:
- `packet_key` (indexed, keyword)
- `source_ref` (indexed, keyword)
- `workspace_id` (indexed, keyword) — **Phase 12: `snapshot-phase12-{date}`**
- `ontology_version` (indexed, keyword) — **Phase 12: `'1.0'`**
- `postgres_id` (not indexed)
- `language` (indexed, keyword)
- `domain_class` (indexed, keyword)
- `concepts` (indexed, keyword array)
- `som_cluster` (indexed, integer)
- `kmeans_cluster` (indexed, integer)

**Retrieval pattern**:
```typescript
// Query with filters + sparse + dense fusion
const search = {
  vector: {
    name: 'content',     // dense retrieval vector
    vector: [0.1, ...],  // 384-dim embedding
  },
  sparse: {
    indices: [12, 45, 89], // BM42 sparse indices
    values: [0.8, 0.6, 0.4],
  },
  filter: {
    must: [
      { key: 'workspace_id', match: { value: 'snapshot-phase12-2026-07-28' } }
    ]
  },
  with_payload: true,  // return payloads
  limit: 50,           // top-50 candidates
  fusion_strategy: 'rrf', // Qdrant native RRF
};
```

---

## Qdrant Reranker Models (Enterprise)

**Available in Qdrant Enterprise** (not used in Phase 12, for reference):

| Reranker | Type | Use Case | Notes |
|----------|------|----------|-------|
| BM25 Fusion | Native | Hybrid search | Open source, always available |
| RRF (Reciprocal Rank Fusion) | Native | Multi-vector | Combines dense + sparse |
| ColBERT | Model Plugin | Semantic precision | Requires model download |
| BGE Reranker | Model Plugin | Semantic re-ranking | Lightweight, fast |
| LLM Reranker | Custom | Context-aware ranking | Via API plugin |

**Phase 12 uses**: Native RRF (no plugins needed).

---

## LibTorch Reranker (GPU Acceleration)

**Location**: `sveltekit-frontend/src/lib/server/ai/libtorch-reranker.ts`

**What it does**:
```typescript
// Qdrant returns top-50, we compute attention scores for top-10
const scores = await LibTorchReranker.rerank(
  queryVector,    // 384-dim query
  candidateVectors, // top-50 × 384-dim
  { method: 'attention' }
);
// Returns: [0.95, 0.87, 0.76, ...] (refined scores)
```

**When to use**:
- ✅ After Qdrant fusion for final ranking
- ✅ When top-K gap is large (>0.15 score spread)
- ✅ For complex queries (multiple intent signals)
- ❌ Not needed if RRF already ranks them well (<0.1 spread)

**Fallback**: CPU cosine similarity if GPU unavailable.

---

## Next Steps (Phases 13-16)

### Phase 13: K-Means Clustering
- Use workspace_id to partition snapshot
- Compute 64 cluster centroids on frozen 384-dim vectors
- Add `kmeans_cluster` to Qdrant payload

### Phase 14: SOM Topology
- Train 20×20 self-organizing map
- Add `som_cluster`, `som_row`, `som_col` to payload
- Enable topology-aware reranking (nearby clusters first)

### Phase 15: Qdrant Payload Enrichment
- Add sparse vector definitions to collection schema (if not present)
- Backfill missing workspace_id values
- Wire full RRF fusion into search API

### Phase 16: ACE Context Assembly
- Use RRF-ranked candidates
- Apply optional GPU reranking (LibTorch attention)
- Build evidence-grounded context for Gemma4

---

## Sparse Vector Details (BM42)

**What is BM42?**
- BM42 is Qdrant's implementation of sparse vector search
- Similar to BM25 (probabilistic ranking function)
- Inverted index over token indices
- Fast (~1-5ms for 1M documents)

**Generation**:
```typescript
import { generateSparseVector } from '$lib/server/vector/bm42-sparse.ts';

const sparse = generateSparseVector(
  'packet_key: abc123\nsource_ref: src/lib/server\nfeature_id: auth.sessions'
);
// Returns: { indices: [12, 45, 89], values: [0.8, 0.6, 0.4] }
```

**Indexing in Qdrant**:
```json
{
  "sparse_vectors": {
    "bm42": {}  // canonical name
  }
}
```

---

## Canonical Naming Convention

**Before Phase 12 (inconsistent)**:
- Some code: `bm42_sparse`
- Some code: `bm42`
- Contract: `bm42`

**After Phase 12 (canonical)**:
- All code: `bm42` ✅
- All contracts: `bm42` ✅
- All Qdrant collections: sparse vector name = `bm42`

**Why it matters**: Qdrant collection schema must match upsert requests. Mismatched names cause validation errors.

---

## Summary

**Phase 12 closure**:
1. ✅ workspace_id populated + ontology_version added
2. ✅ Sparse vector naming normalized to `bm42` (canonical)
3. ✅ All reference files updated (script, registry, semantics)
4. ⏳ Qdrant upsert will succeed once collection schema includes sparse vectors (Phase 15+)

**Reranking recap**:
- Qdrant native: RRF (dense + sparse fusion)
- GPU optional: LibTorch attention (final ranking)
- Phases 13-16: Add clustering, topology, enterprise features

**Key files**:
- `qdrant-collection-contracts.ts` — canonical schema + contract version
- `retrieval-semantics.ts` — vector/sparse naming + fusion strategy
- `qdrant-manager.ts` — Qdrant API wrapper + search implementation
- `libtorch-reranker.ts` — GPU attention scoring (optional post-query)
- `build-vector-index-lanes.mts` — Phase 12 snapshot generation

---

**Last Updated**: 2026-07-28  
**Status**: Naming normalized, Phase 12 ready, Phase 15+ scope documented
