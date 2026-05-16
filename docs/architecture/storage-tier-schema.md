# Storage Tier Architecture — Vector Retrieval Stack

_Phase 9C  |  Last updated: 2026-05-16_

## Overview: 4-Layer Retrieval Stack

```
User Query
  │
  ▼
embed 768d (embeddinggemma:latest → Ollama :11434)
  │
  ▼  ┌──────────────────────────────────────────────────────────────┐
  │  │  LAYER 2 — Warm / Routing Tier                              │
  │  │  autoencode 768d → 64d                                      │
  │  │  find top-K nearest centroids (centroid_registry)           │
  │  │  pull cluster cards (cluster_cards → Redis cluster:card:*)  │
  │  └──────────────────────────────────────────────────────────────┘
  │
  ▼  ┌──────────────────────────────────────────────────────────────┐
  │  │  LAYER 3 — Hot Tier (Redis)                                 │
  │  │  cluster:card:{centroid_id}  → top chunk IDs + summary      │
  │  │  ace:cluster:top:{collection} → authority-sorted centroids  │
  │  │  gpu:karpathy:scores          → Karpathy blend cache        │
  │  └──────────────────────────────────────────────────────────────┘
  │
  ▼  ┌──────────────────────────────────────────────────────────────┐
  │  │  LAYER 1 — Cold Tier (Postgres pgvector + Qdrant)           │
  │  │  Qdrant filter: must:{centroid_id in top-K centroids}       │
  │  │  ANN on 768d content embeddings                             │
  │  │  top-100 candidates → rerank with Karpathy blend            │
  │  └──────────────────────────────────────────────────────────────┘
  │
  ▼  ┌──────────────────────────────────────────────────────────────┐
  │  │  LAYER 4 — Graph Tier (Neo4j + CouchDB PageRank)            │
  │  │  expand chunk_id → document → entity → statute → case      │
  │  │  BELONGS_TO_CENTROID edges (new)                            │
  │  │  SIMILAR_TOPOLOGY / IMPORTS / SHARES_TAGS (existing)        │
  │  └──────────────────────────────────────────────────────────────┘
  │
  ▼
ACE packet (top 8–20 citations with sourceRefs)
  │
  ▼
Gemma4 synthesis (llama-server :8090)
```

### Scale math (10M legal chunks)
```
10,000,000 chunks
  → k-means K=10,000 centroids (64d)
  → query: top-20 nearest centroids
  → ~20,000 candidate chunks (20 clusters × 1,000 avg members)
  → Qdrant ANN over 20,000 candidates (not 10M)
  → top-100 reranked with 768d cosine + Karpathy blend
  → top-8 to top-20 citations in ACE packet
```

---

## Layer 1: Cold Tier — Ground Truth 768d

**Purpose:** Truth recall. Immutable after indexing. Used for final reranking.

| Store | Table / Collection | Dimension | Content |
|-------|--------------------|-----------|---------|
| Postgres pgvector | `codebase_chunk_index.summaryEmbedding` | vector(768) | Codebase chunks |
| Postgres pgvector | `codebase_chunk_index.signatureEmbedding` | vector(768) | Chunk signatures |
| Postgres pgvector | `evidence_vectors.embedding` | vector(768) | Evidence chunks |
| Postgres pgvector | `document_embeddings.embedding` | vector(768) | Legal docs |
| Qdrant | `codebase_chunks_768` (named: `content`) | 768d | Primary ANN store |
| Qdrant | `evidence_items` | 768d | Evidence ANN |
| Qdrant | `legal_documents` | 768d | Legal doc ANN |

**Access pattern:** Qdrant ANN with centroid filter (Layer 2 provides the filter). Never scan without a filter for >10K chunk collections.

**HNSW indexes** (applied via `drizzle/manual/20260516_hnsw_indexes.sql`):
- `evidence_vectors_hnsw_idx` — `USING hnsw(embedding vector_cosine_ops)`
- `codebase_chunk_index_hnsw_idx` — on `summary_embedding`

---

## Layer 2: Warm Tier — Compressed 64d Routing

**Purpose:** Fast candidate routing. Never used for final ranking.

### New tables (migration: `drizzle/manual/20260516_storage_tier_routing.sql`)

**`centroid_registry`** — one row per k-means centroid per collection.
```
centroid_key   "codebase_chunk_index:k20:c07"  (stable across re-runs)
collection     "codebase_chunk_index"
cluster_k      20                               (total K)
cluster_idx    7                                (0..K-1)
centroid_vector vector(64)                      (compressed centroid)
member_count   1247
authority_score 0.73                            (Karpathy blend avg of members)
semantic_label  "Database schema + Drizzle ORM"
```

**`cluster_cards`** — denormalized fast-access card per centroid.
```
centroid_id              → FK to centroid_registry
top_chunk_ids            uuid[]  (top-100 within cluster by 768d score)
top_file_paths           text[]  (for display — no join needed)
cluster_summary          text    (Gemma4-generated cluster summary)
representative_embedding vector(768)  (for final 768d rerank against query)
authority_score          real
```

### New columns on `codebase_chunk_index`
```sql
centroid_id           uuid     → FK to centroid_registry (nullable until autoencoder runs)
compressed_embedding  vector(64)
reconstruction_error  real     (MSE of 768d→64d→768d — fidelity guard)
routing_tier          varchar  'cold' | 'warm' | 'hot'
```

### Qdrant payload additions (per point)
```json
{
  "centroid_id": "uuid",
  "routing_tier": "warm",
  "reconstruction_error": 0.032
}
```
**Enables Qdrant filter:** `must: [{ key: "centroid_id", match: { any: [top_centroid_ids] } }]`

---

## Layer 3: Hot Tier — Redis

**Purpose:** Sub-10ms recall for top candidates within the current query session.

| Key pattern | Type | TTL | Content |
|-------------|------|-----|---------|
| `cluster:card:{centroid_id}` | HASH | 3600s | `top_chunk_ids`, `top_tags`, `summary`, `authority` |
| `cluster:members:{centroid_id}` | ZSET | 3600s | chunk_id → 768d_score (sorted) |
| `centroid:routing:{collection}` | HASH | 7200s | cluster_idx → centroid_id |
| `ace:cluster:top:{collection}` | ZSET | 1800s | centroid_id → authority_score |
| `gpu:karpathy:scores` | HASH | 86400s | file → `{pr,attn,authority,blend}` |
| `ace:topo:{class}:{hash}` | STRING | 300s | topo-byte candidate cache |

**Cache warm path:** ACE Stage A0 checks `ace:topo:*` before Qdrant ANN (existing). Stage A1 (new) checks `ace:cluster:top:{collection}` to get the top-authority centroid_ids, then `cluster:card:{id}` for candidate chunk IDs.

---

## Layer 4: Graph Tier — Neo4j / CouchDB

**Purpose:** Relation reasoning. Multi-hop expansion.

### Existing edges used
- `BELONGS_TO_CLUSTER` (chunk → GPUCluster node)
- `SIMILAR_TOPOLOGY` (chunk ↔ chunk via SOM adjacency)
- `IMPORTS` (file → file)
- `SHARES_TAGS` (pending — Lane C)

### New edge: `BELONGS_TO_CENTROID`
```cypher
MATCH (c:CodebaseChunk {qdrantId: $qdrantId})
MATCH (ctr:Centroid {centroidKey: $centroidKey})
MERGE (c)-[:BELONGS_TO_CENTROID {
  reconstructionError: $mse,
  routingTier: 'warm'
}]->(ctr)
```
**Write location:** `scripts/run-hypergraph.ts` Step 14 (after centroid assignment).

---

## Data Ingestion Pipeline

```
1. Chunk document (legal-chunker.ts — ARTICLE/SECTION/§ aware)
   │
2. Extract metadata (entity-extraction.ts — EMAIL, PHONE, DATE, STATUTE, MONEY)
   │
3. Embed 768d (embeddinggemma:latest via gRPC :50051 or HTTP /api/embed)
   │  Cold: store in Postgres codebase_chunk_index.summaryEmbedding
   │  Cold: store in Qdrant codebase_chunks_768 (named vector "content")
   │
4. Autoencode 768d → 64d (AutoencoderService — PENDING trained weights)
   │  Warm: store compressed_embedding + reconstruction_error in Postgres
   │  Warm: add centroid_id to Qdrant payload
   │
5. Assign centroid via nearest-centroid lookup (k-means run offline)
   │  Warm: UPDATE codebase_chunk_index SET centroid_id = $id, routing_tier = 'warm'
   │
6. Update cluster_cards.top_chunk_ids (if new chunk displaces an existing top-100)
   │  Hot: invalidate Redis cluster:card:{centroid_id}
   │
7. Write Neo4j BELONGS_TO_CENTROID edge
   │
8. Update ace:cluster:top:{collection} ZSET if authority_score changed
```

---

## Query Retrieval Pipeline

```
1. Embed query 768d (embeddinggemma:latest)
   │
2. Autoencode query 768d → 64d
   │
3. Top-K centroid lookup
   │  Hot path: ace:cluster:top:{collection} ZSET → top-20 centroid_ids
   │  Warm fallback: SELECT id FROM centroid_registry ORDER BY ... (cosine distance)
   │
4. Pull cluster cards
   │  Hot: HGET cluster:card:{id} for each centroid_id
   │  Warm fallback: SELECT * FROM cluster_cards WHERE centroid_id = ANY(...)
   │
5. Qdrant ANN with centroid filter
   │  filter: { must: [{ key: "centroid_id", match: { any: top_centroid_ids } }] }
   │  vector: query 768d content embedding
   │  limit: 100 candidates
   │
6. Rerank with Karpathy blend
   │  score = 0.4·pageRank + 0.3·attentionScore + 0.3·graphAuthority
   │  hot: gpu:karpathy:scores HGET for each candidate file
   │
7. Neo4j expansion (optional — +200ms)
   │  MATCH (c)-[:BELONGS_TO_CENTROID|IMPORTS|SIMILAR_TOPOLOGY*1..2]->(related)
   │
8. Build ACE packet (top 8–20 citations)
   │
9. Gemma4 synthesis (llama-server :8090)
```

---

## Autoencoder Status

**Current:** Xavier-initialized weights → flat outputs → attention scores cluster at ~1.0 (Δ < 0.01).  
**Blocked by:** Trained autoencoder weights not yet available.  
**Workaround:** `attentionScoreGPU` runs directly on 768d embeddings (as documented in CLAUDE.md karpathy-gpu section). The 64d `compressed_embedding` column will populate once trained weights are applied via `AutoencoderService`.

**Training target:** 768d → 128d → 768d (two-stage) with MSE loss on reconstruction.  
Planned: Colab G4 training run on existing 3000+ codebase chunks (Qdrant `codebase_chunks_768` collection).

---

## Related Files

| File | Purpose |
|------|---------|
| `drizzle/manual/20260516_storage_tier_routing.sql` | SQL migration for new tables + column additions |
| `schema-postgres.ts` (`centroidRegistry`, `clusterCards`) | Drizzle declarations |
| `scripts/run-hypergraph.ts` | k-means GPU centroids, Neo4j sync (extend for BELONGS_TO_CENTROID) |
| `src/lib/server/cache/topo-candidate-cache.ts` | Existing topo-byte cache (ACE Stage A0) |
| `docs/reports/turbovec-evaluation-plan.md` | TurboVec 128d routing evaluation plan |
| `models/model-manifest.json` | Model registry (autoencoder weights will be listed here) |
