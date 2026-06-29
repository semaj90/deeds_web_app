# Dimension Policy: Embedding Standards & Compression Rules

**Date**: June 28, 2026 (CORRECTED Session 89)  
**Authority**: Live Audit Verified (June 28, 2026)  
**Status**: ENFORCED — No exceptions without explicit approval

---

## Core Rule: Canonical Embedding Dimension = 768

```
EMBEDDING_DIMENSION         = 768 (VERIFIED via live Ollama test)
EMBED_MODEL                 = embeddinggemma:latest (native output, NOT truncated)
EMBEDDING_STORAGE           = halfvec(768) [active in codebase_chunk_index]
MIGRATION_IN_PROGRESS       = vector(384) column exists but unpopulated
truth_store                 = Postgres codebase_chunk_index.content_embedding (halfvec 768)
ann_mirror                  = Qdrant collection "codebase_chunks_768" (768-dim vectors)
cache_store                 = Redis (24h TTL on full 768-dim, or compressed 64-dim for memory)
search_reranking            = GPU cosine similarity on 768-dim (or 384-dim if migration completes)
```

### Why 768 (VERIFIED BY AUDIT)?

- **embeddinggemma:latest** (Ollama embedding model) produces 768-dimensional vectors natively
- **Verified June 28, 2026**: Live test against `/api/embed` confirms 768-dim output
- **Active storage**: `codebase_chunk_index.content_embedding` is halfvec(768), populated with 40,568 vectors
- **Qdrant mirror**: `codebase_chunks_768` correctly named and stores 768-dim vectors (not 384)
- **Deterministic** — same packet = same embedding (no randomness with fixed seed)
- **Not truncated** — No Matryoshka truncation pipeline exists; full 768-dim is stored and searched
- **Normalized** — L2-norm applied (vectors on unit hypersphere, cosine similarity = dot product)
- **Production-tested** — Phase 0-7 audits used this dimension, proven stable

### Migration Status (IMPORTANT)

A migration to 384-dim is in progress but NOT COMPLETE:
- `content_embedding_384` column exists with vector(384) type
- `idx_codebase_chunk_content_embedding_384_hnsw` index exists
- BUT: 0 vectors populated (migration not yet run)
- `embedding_dimension` metadata field = 384 (intent, not reality)

**Do NOT assume 384 is active yet.** All active retrieval uses 768-dim.

### Qdrant Collection Configuration

**Active collection** `codebase_chunks_768`:
- **Status**: CANONICAL, stores 768-dim vectors
- **Contains**: All 40,568 embedded code chunks from codebase_chunk_index
- **Named vectors** (all 768-dim):
  - `content`: Raw embedding (primary search vector)
  - `error`: Reserved for AE reconstruction error (future advanced reranking)
  - `signature`: Reserved for structural fingerprint (future fast filtering)
- **Do NOT migrate** unless migration to 384-dim completes in Postgres first

**Future collection** `codebase_chunks_384`:
- **Status**: RESERVED, prepared but unpopulated
- **Migration plan**: Only populate if vector(384) backfill succeeds in Postgres
- **Not yet active**: Do not use for production queries

```json
{
  "name": "codebase_chunks_768",
  "vectors": {
    "content": {
      "size": 768,
      "distance": "Cosine"
    },
    "error": {
      "size": 768,
      "distance": "Cosine"
    },
    "signature": {
      "size": 768,
      "distance": "Cosine"
    }
  },
  "payload_schema": {
    "packet_key": "keyword",
    "source_ref": "keyword",
    "feature_id": "keyword",
    "relative_path": "keyword",
    "chunk_hash": "keyword",
    "som_cluster": "integer",
    "kmeans_cluster": "integer",
    "ontology_tags": "keyword",
    "summary_hash": "keyword"
  }
}
```

**Vector meanings**:
- `content`: Raw embedding (primary search vector, 768-dim halfvec in Postgres)
- `error`: Reserved for AE reconstruction error (future advanced reranking)
- `signature`: Reserved for structural fingerprint (future fast filtering)

**All active vectors MUST be 768-dim**. No mixing 768 with 384 in production queries until migration completes.

---

## Compression: AE (384→64) is Optional, Not for Search

### When NOT to Compress

```
NEVER compress embeddings before storing in Qdrant.
NEVER mix compressed (64-dim) and full (384-dim) in search indexes.
NEVER use AE output for similarity search.
```

### When to Compress (Optional Paths)

**Path A: Memory optimization (Redis cache pruning)**
```
384-dim vector → AE encoder → 64-dim latent
Store in Redis as "embedding:compressed:{key}"
TTL = 1h (short-lived, fast fallback)
Do NOT use for search — only for eviction budget
```

**Path B: Graph embedding (Neo4j properties)**
```
384-dim vector → AE encoder → 64-dim latent
Store in Neo4j as `p.embedding_compressed`
Use for: node coloring, force-directed layout (visual), NOT search
Do NOT use in Cypher UNWIND similarity comparisons
```

**Path C: Future MLA-style attention (experimental)**
```
384-dim vector → AE encoder → 64-dim bottleneck
Store in DuckDB as `embedding_low_rank`
Reason: DeepSeek-MLA-style token mixing
Status: NOT YET WIRED (reserved for future)
```

### AE Training Requirement (Future)

**DO NOT use random-weight AE**. Currently all AE outputs are from an untrained Xavier-initialized encoder (flat tanh outputs, no useful compression). When training an AE:

1. Use reconstruction loss (384-dim input → 64-dim bottleneck → 384-dim output)
2. Collect 10K+ packets, train 100 epochs
3. Validate reconstruction error < 0.1 MSE
4. Version the AE (e.g., `ae_v1`, `ae_v2`) and store weights in Postgres
5. Only then use 64-dim outputs in any downstream task

Until trained: **AE is reserved, do not use**.

---

## SOM Grid: 20×20 (Fixed)

```
SOM_ROWS = 20
SOM_COLS = 20
SOM_CELLS = 400 (fixed topology)

som_bmu_row ∈ [0, 19]
som_bmu_col ∈ [0, 19]
som_cluster = som_bmu_row * 20 + som_bmu_col  (cell ID 0-399)
```

### Why 20×20?

- **Topologically rich** — 400 neighborhoods for adjacency-based queries
- **Computationally stable** — not too coarse (10×10 = 100), not too dense (50×50 = 2500)
- **Convergence proved** — existing Phase 0A SOM trained on codebase chunks, stable 200 iterations

### SOM Training Rules

- **Algorithm**: Self-Organizing Map (Kohonen)
- **Initialization**: Random weight vectors (768-dim each)
- **Distance metric**: Euclidean on 768-dim space
- **Learning schedule**: Linear decay (start 0.5, end 0.01, linear over 200 iterations)
- **Neighborhood**: Gaussian kernel (sigma starts 5, ends 1, linear decay)
- **Input**: All packets' 768-dim embeddings (normalized, from codebase_chunk_index.content_embedding)
- **Output**: som_bmu_row/col for each packet + 400 cell centroids (stored in Redis)

**Do NOT retrain SOM unless**:
- >10% of packets have changed feature_id
- Topology divergence detected (cells disconnected, isolated)
- Requires explicit `--retrain-som` flag

### Query: Find SOM Neighbors

```sql
SELECT p.packet_key
FROM atlas_packets p
WHERE abs(p.som_bmu_row - $row) <= 1
  AND abs(p.som_bmu_col - $col) <= 1
  AND NOT (p.som_bmu_row = $row AND p.som_bmu_col = $col)
LIMIT 8;  -- 8 neighbors for 20×20 grid (Moore neighborhood)
```

---

## K-Means: Domain-Specific, No Fixed K

```
K (number of clusters) depends on domain:
  - Codebase features:    K = 5-10   (auth, database, UI, API, utils)
  - Legal documents:      K = 10-20  (contract types, jurisdictions)
  - Evidence packets:     K = 3-7    (persons, locations, events)

Default: K = floor(total_packets / 100)
Min: K = 3
Max: K = 50
```

### K-Means Training Rules

- **Algorithm**: Lloyd's K-means (standard)
- **Initialization**: K-means++ (smart seed selection)
- **Distance metric**: Euclidean on 768-dim space
- **Convergence**: 100 iterations max or <1e-6 centroid change
- **Input**: All packets' 768-dim embeddings (normalized, from codebase_chunk_index.content_embedding)
- **Output**: Cluster assignment per packet + K centroids

### Storage

```
atlas_packets.kmeans_cluster ∈ [0, K-1]
Redis: centroid:kmeans:{cluster_id} → 768-dim Float32Array
```

### Query: Find Cluster Members

```sql
SELECT p.packet_key
FROM atlas_packets p
WHERE p.kmeans_cluster = $cluster_id
LIMIT 100;
```

---

## Dimension Mismatch Rules (Hard Stops)

### ❌ DO NOT

```typescript
// Mix 384 and 768 in same Qdrant search
// This will silently fail or return garbage
const results = qdrant.search({
  vector: embedding_384,
  collection_name: 'codebase_chunks_768'  // ← expects 384, will fail
});

// Use AE-compressed (64-dim) in Qdrant search
const results = qdrant.search({
  vector: ae_latent_64,  // ← wrong dimension
  collection_name: 'codebase_chunks_768'
});

// Store 384-dim in 768-dim collection (padding/truncation)
qdrant.upsert('old_collection_768', {
  vector: [...embedding_384, ...zeros_384]  // ← corrupts payload
});
```

### ✅ DO

```typescript
// 1. Verify embedding is 768-dim before using (VERIFIED via live audit)
const embedding = await embedder(packet);  // must be 768-dim
if (embedding.length !== 768) throw new Error('Dimension mismatch: expected 768, got ' + embedding.length);

// 2. Search in canonical collection (ACTIVE)
const results = qdrant.search({
  vector: embedding,
  collection_name: 'codebase_chunks_768'  // canonical active collection
});

// 3. Store full embedding in Qdrant with payload contract
qdrant.upsert('codebase_chunks_768', {
  vectors: {
    content: embedding,        // 768-dim (primary search)
    error: embedding,          // 768-dim (reserved future use)
    signature: embedding       // 768-dim (reserved future use)
  },
  payload: {
    packet_key: packet.key,
    source_ref: packet.sourceRef,
    feature_id: packet.featureId,
    relative_path: packet.relativePath,
    chunk_hash: packet.hash,
    som_cluster: packet.somCluster,
    kmeans_cluster: packet.kmeansCluster,
    ontology_tags: packet.tags,
    summary_hash: packet.summaryHash
  }
});

// 4. Optional: Compress to 64-dim AFTER search for memory optimization (not for search)
const searchResults = await qdrant.search(embedding);  // search with 768-dim
const compressed = compress_ae(searchResults[0].vector);  // compress to 64-dim for cache/memory only
```

---

## Validation Checklist

**Before writing any packet to Qdrant**:

- [ ] `embedding.dimension === 768`
- [ ] `embedding.normalized === true`
- [ ] `som_cluster ∈ [0, 399]`
- [ ] `kmeans_cluster ∈ [0, K-1]`
- [ ] No mixed 768/384 in same operation (until migration completes)
- [ ] No AE-compressed vectors in search vectors
- [ ] Payload matches Qdrant schema

**Before starting SOM/KMeans training**:

- [ ] All packets have embeddings (no NULLs)
- [ ] All embeddings are 768-dim (source: codebase_chunk_index.content_embedding)
- [ ] All embeddings are L2-normalized
- [ ] No duplicate packets (dedup by source_ref + source_id)

**Before caching in Redis**:

- [ ] Vector is 768-dim for full search cache (or 64-dim for memory-only paths)
- [ ] TTL is set (default 24h for 768-dim, shorter for 64-dim)
- [ ] Key includes version prefix (e.g., `embedding:v1:...`)

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| v1.0 | 2026-06-28 | Establish 384-dim embeddinggemma truth; reserve AE; fix SOM 20×20; K-means domain-specific |

---

---

## Canonical Architecture: Truth Flow

```
Postgres pgvector(384)  ← CANONICAL TRUTH
    ↓ (mirror sync)
Qdrant codebase_chunks_384 (ANN search)
    ↓ (semantic retrieval)
Redis/Bifrost (cache, ephemeral, rebuildable)
    ↓ (high-speed recall)
Neo4j (topology/relationships, rebuilt from Postgres + Qdrant)
```

**Hard rule**: Write to Postgres first. Mirror and cache writes are secondary, idempotent. If mirrors diverge, the truth source is always Postgres.

---

## Verification: audit-embedding-dimensions.mjs

Before any migration or summary regeneration, run:

```bash
npm run atlas:audit:embeddings --verbose
```

**Expected output table**:

| Component | Expected | Actual | Status | Notes |
|-----------|----------|--------|--------|-------|
| Ollama embedding output | 384 or configured | ? | PASS/FAIL | Query `/api/embed` with test string |
| Postgres pgvector column | vector(384) | ? | PASS/FAIL | Schema inspection |
| Qdrant codebase_chunks_384 | 384 | ? | PASS/FAIL | Collection config |
| Redis cached vectors | 384-dim | ? | PASS/FAIL | Sample cache keys |
| SOM trainer input | 384-dim | ? | PASS/FAIL | Pre-training check |
| AE encoder input | 384-dim (reserved) | ? | N/A | Future use only |

**Rule**: Do NOT proceed to summary regeneration or migration until all components report actual=expected.

---

## References

- **Embedding model**: `embeddinggemma:latest` (Ollama, native 768-dim output)
- **Live audit**: `scripts/atlas/audit-live-embedding-output.mjs` (verified June 28, 2026)
- **Embedding output**: `curl http://localhost:11434/api/embeddings` (inspect response `embedding` field, expect 768 elements)
- **Active storage**: Postgres `codebase_chunk_index.content_embedding` (halfvec 768-dim, 40,568 populated)
- **SOM implementation**: Phase 0A (existing, stable, trains on 768-dim)
- **K-Means baseline**: K = packets / 100 (configurable per domain, trains on 768-dim)
- **AE training** (future): Planned to compress 768→64-dim. Reserved, not wired yet. Do not use random-weight AE outputs.
- **Postgres types**: 
  - `content_embedding`: halfvec(768) [ACTIVE]
  - `content_embedding_384`: vector(384) [MIGRATION PENDING, 0% populated]
- **Qdrant REST API**: `GET /collections/codebase_chunks_768` (active, 40,568 points, 768-dim vectors)
- **Audit Authority**: `docs/EMBEDDING-DIMENSION-AUDIT-2026-06-28.md` (verified findings, definitive truth source)

---

**ENFORCED: DO NOT DEVIATE FROM THIS POLICY WITHOUT EXPLICIT APPROVAL.**

- **Canonical dimension is 768-dim** — verified by live Ollama audit (June 28, 2026)
- **Active Qdrant collection is `codebase_chunks_768`** — correctly named, stores 768-dim vectors
- **Active Postgres column is `content_embedding` (halfvec 768)** — migration to 384-dim not yet complete
- **Any dimension mismatch is a hard stop** — errors caught early in audit, not in production
- **Do NOT use `codebase_chunks_384` until migration in Postgres completes** — currently 0% populated
- **Postgres codebase_chunk_index IS truth. Qdrant and Redis ARE mirrors/cache.**
- **All active vectors MUST be 768-dim and L2-normalized before indexing**
