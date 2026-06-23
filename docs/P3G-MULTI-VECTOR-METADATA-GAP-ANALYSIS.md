# P3g Multi-Vector Metadata Gap Analysis

**Date**: 2026-06-23 Session 72  
**Topic**: What we're fixing, what's missing, how to make vectors more searchable for ACE/KAG/DAG

---

## What We're Fixing (P3g Collision Repair)

**The problem**: 75 Qdrant packets have **collisions** (multiple packets share the same `qdrant_point_id`).

**Why it breaks retrieval**:
```
Query Vector (768-dim)
  ↓
Qdrant ANN search → finds point 1522576465
  ↓
Postgres lookup: WHERE qdrant_point_id = 1522576465
  ↓
Returns 8 packets (all from evidence.ts) ← WRONG! Should be 1 packet
  ↓
ACE concatenates all 8 → CORRUPTED CONTEXT
```

**The fix**: 
- Clear collision `qdrant_point_id` values → NULL
- Re-embed 75 packets individually → get unique UUID per packet
- Upsert to Qdrant with unique IDs
- Update Postgres with new `qdrant_point_id` values

---

## What's MISSING (Multi-Vector + Metadata Encoding)

### Current State

**Postgres**: 56 vector columns across tables ✅
```sql
atlas_packets.embedding           (768-dim HNSW indexed)
atlas_packets.latent_128          (128-dim, optional)
atlas_packets.latent_64           (64-dim, optional — bytea, NOT searchable)
atlas_summary_layers.embedding    (768-dim HNSW indexed)
codebase_chunk_index.content_embedding    (halfvec 768-dim HNSW)
codebase_chunk_index.summary_embedding    (halfvec 768-dim HNSW)
```

**Qdrant**: Single vector per point ❌
```
codebase_chunks_768:
  - 52,606 points
  - 1 vector per point (768-dim, content embedding ONLY)
  - 52,606 - 17,994 = 34,687 orphaned points (no Postgres row)
```

**Missing**: Multi-vector search strategy
- ❌ No `summary_embedding` index in Qdrant
- ❌ No `latent_64` (AE) vector index in Qdrant
- ❌ No hybrid dense/sparse search (Qdrant doesn't support BM25 + vector natively)
- ❌ No metadata-aware filtering at query time

---

### Missing Metadata Encoding in Qdrant

**Current Qdrant payload** (what's stored):
```json
{
  "packet_key": "src/lib/server/db/schema/citations.ts:0352c26958a0805c",
  "source_ref": "src/lib/server/db/schema/citations.ts",
  "feature_id": "db.citations",
  "feature_label": "Citations Schema",
  "directory_path": "src/lib/server/db",
  "som_cluster": "42",
  "community_id": "c001"
}
```

**Missing Metadata** (should be encoded):
| Field | Type | Purpose | ACE Use | Status |
|-------|------|---------|---------|--------|
| `ae_epoch` | int | Autoencoder version | Versioning | ✅ In Postgres JSONB |
| `ae_val_loss` | float | AE reconstruction quality | Filtering (quality gate) | ✅ In Postgres JSONB |
| `latent_64_encoded` | bool | Indicates AE latent exists | Route decision | ❌ NOT in Qdrant |
| `summary_embedding_dim` | int | Summary vector dimension | Multi-vector query | ❌ NOT in Qdrant |
| `retrieval_confidence` | float | Human/GAN feedback | Reranking | ❌ NOT in Qdrant |
| `last_accessed_epoch` | int | Cache freshness | TTL/eviction | ❌ NOT in Qdrant |
| `domain_class` | string | Semantic category (auth, db, ui) | Filtering/routing | ✅ In Postgres JSONB |
| `training_dataset_tag` | string | QLoRA/PPO training cohort | Evaluation gate | ❌ NOT in Qdrant |

---

## How to Make Vectors More Searchable (Multi-Vector Strategy)

### Current Single-Vector Search (Limited)

```
User Query: "How does authentication work?"
  ↓
Embed query via embeddinggemma (768-dim)
  ↓
Qdrant ANN on codebase_chunks_768 (content embedding only)
  ↓
Returns top-10 by cosine similarity
  ↓
ACE reranks by: feature_id authority, SOM proximity, Neo4j hops
```

**Problem**: Only content similarity, no semantic abstraction (summary), no compressed retrieval (AE latent).

### Missing Multi-Vector Search Strategy

**Option 1: Qdrant Multi-Vector (Recommended)**

Qdrant **v1.13+** supports multiple named vectors per point:

```python
# Upsert with multiple vectors
qdrant_client.upsert(
  collection_name="codebase_chunks_768",
  points=[
    PointStruct(
      id=uuid(),
      vector={
        "content": embedding_768,      # ← Dense retrieval
        "summary": summary_embedding_768,  # ← Semantic abstraction
        "latent_64": ae_encoded[:64],      # ← Compressed routing
      },
      payload={
        "packet_key": "...",
        "ae_confidence": 0.95,
        "vector_strategy": "content+summary+latent",
        "retrieval_confidence": 0.88,
      }
    )
  ]
)

# Multi-vector search
search_result = qdrant_client.search(
  collection_name="codebase_chunks_768",
  query_vector=NamedVector(
    name="content",  # ← OR "summary" OR "latent_64"
    vector=query_embedding_768
  ),
  query_filter=Filter(
    must=[
      HasIdCondition(has_id=[...]),
      FieldCondition(
        key="ae_confidence",
        range=Range(gte=0.8)  # ← Metadata filter
      )
    ]
  ),
  limit=100,
  score_threshold=0.6
)
```

**Advantage**: Same collection, 3 search strategies, metadata filtering, no orphaned points.

---

**Option 2: Qdrant + TurboVec Prefilter (Current Workaround)**

```python
# TurboVec Stage 1: Fast 64-dim prefilter
prefilter_candidates = turbovec_search(
  query_latent_64,
  top_k=1000
)

# Stage 2: Qdrant rerank on full 768-dim
rerank = qdrant_client.search(
  query_vector=query_embedding_768,
  query_filter=HasIdCondition(has_id=prefilter_candidates),
  limit=100
)
```

**Advantage**: Fast recall (1000 candidates), then precise ranking.  
**Problem**: TurboVec HTTP sidecar offline in current checkout.

---

**Option 3: Postgres pgvector + Qdrant (Hybrid)**

```sql
-- Postgres: Multiple vector columns, all indexed
SELECT 
  packet_key,
  embedding <-> query_embedding AS dist_content,
  summary_embedding <-> query_summary AS dist_summary,
  latent_64_embedding <-> query_latent AS dist_ae,
  (0.6 * dist_content + 0.3 * dist_summary + 0.1 * dist_ae) AS hybrid_score,
  metadata->>'ae_confidence' AS ae_confidence,
  metadata->>'domain_class' AS domain
FROM atlas_packets
WHERE 
  embedding <-> query_embedding < 2.0  -- Postgres HNSW prefilter
  AND metadata->>'ae_confidence' > 0.8  -- Metadata gate
ORDER BY hybrid_score
LIMIT 100;
```

**Advantage**: Rich metadata filtering (Postgres WHERE clause), multiple vector distance metrics.  
**Problem**: Postgres latency (~12ms) vs Qdrant GPU (~5-20ms).

---

## How AE (Autoencoder) + PyTorch + LibTorch Helps

### Current AE State (Frozen)

```
768-dim content embedding
  → PyTorch AE encoder
  → 64-dim latent (compressed semantic representation)
  → Stored in atlas_packets.latent_64 (but bytea, NOT searchable)
```

**What's frozen**: Training is halted (no new weights).  
**Why**: Eval gates require improvement proof before retraining.

### How AE Helps Retrieval

**Stage 1: Fast candidate selection (latent_64)**
```
Query: "authentication flow"
  ↓
Embed query via embeddinggemma (768-dim)
  ↓
AE encode query → 64-dim latent representation
  ↓
Search latent_64 index (MUCH faster than 768-dim)
  ↓
Returns 1,000 candidates in < 2ms
```

**Stage 2: Precise ranking (full 768-dim)**
```
Take 1,000 candidates from latent search
  ↓
Rerank using full 768-dim content embedding
  ↓
Apply GPU cosine similarity (LibTorch batchCosineSimilarity)
  ↓
Return top-100 ranked by score
```

**Overall latency saved**: ~150ms (skip 750+ expensive full-dim comparisons).

### Why We're NOT Retraining AE Right Now

**From workstation TODO line 509**:
> "Do not reopen schema redesign, packet identity, AE retraining, SOM retraining, TensorRT planning, or PPO/router experiments for this lane."

**Reason**: 
- AE is **frozen at current configuration** (768 → 64)
- **Eval harness must pass first** (Phase 21 gate)
- **GRPO/PPO policy training** depends on stable AE baseline
- **No concrete caller** needs a different latent dimension

**What WOULD trigger AE retraining**:
- ✅ Eval metrics improve with new latent dimension
- ✅ Specific retrieval queries need different compression (e.g., 256-dim for finer granularity)
- ✅ Gemma4 task requires 32-dim for token embedding alignment

---

## Specific Missing Pieces for ACE/KAG/DAG Hits

### ACE (Atlas Context Engine) Needs

**Current**:
```python
# ACE Stage A0: Qdrant lookup
qdrant_hits = qdrant.search(
  query_vector=query_embedding_768,
  limit=100
)

# ACE Stage A1: Neo4j expansion (k=2 hops)
neo4j_neighbors = neo4j.neighbors(
  qdrant_hits,
  depth=2
)

# ACE Stage A2: Rerank by authority
reranked = karpathy_blend(
  hits=neo4j_neighbors,
  weights={
    "pagerank": 0.4,
    "attention": 0.3,
    "authority": 0.3
  }
)
```

**Missing for better ACE hits**:
1. ❌ **Multi-vector pre-filter** — Skip Stage A1 for low-confidence packets
2. ❌ **Metadata-aware filtering** — Filter by `domain_class` (auth vs db vs ui)
3. ❌ **Query-time AE encoding** — Route queries through latent_64 for speed
4. ❌ **Confidence gates** — Skip packets with `ae_confidence < 0.8` or `retrieval_confidence < 0.6`

### KAG (Knowledge-Augmented Generation) Needs

**Current**: Neo4j USED_CONCEPT edges + Postgres FTS
```python
concepts = neo4j.concepts(query)  # "authentication", "session", "token"
chunks = postgres_fts(concepts)    # Full-text search on concept names
```

**Missing**:
1. ❌ **Concept embedding vectors** — Embed each concept, search by semantic similarity
2. ❌ **Concept-to-packet metadata** — Know which packets CONTAIN which concepts (Qdrant tag)
3. ❌ **Multi-hop metadata propagation** — Concepts → packets → related_packets

### DAG (Directed Acyclic Graph) Needs

**Current**: Packet dependency edges in Neo4j
```
imports(auth.ts, session.ts) → both retrieved
```

**Missing**:
1. ❌ **Dependency-aware reranking** — Boost packets that are imported by retrieved packets
2. ❌ **Cycle detection metadata** — Mark packets as part of circular dependency
3. ❌ **Artifact lineage tracking** — Know which packets feed into which compile outputs

---

## The Fix: Multi-Vector Qdrant Schema

**Immediate action** (after P3g collision repair):

```sql
-- Step 1: Add latent_64_embedding to atlas_packets (pgvector)
ALTER TABLE atlas_packets 
ADD COLUMN latent_64_embedding vector(64) NULL;

CREATE INDEX idx_atlas_packets_latent_64_hnsw 
ON atlas_packets USING hnsw (latent_64_embedding vector_cosine_ops) 
WITH (m='16', ef_construction='32');  -- Smaller m for 64-dim

-- Step 2: Populate latent_64 from existing AE encodings
UPDATE atlas_packets
SET latent_64_embedding = latent_64::vector
WHERE latent_64 IS NOT NULL;

-- Step 3: Backfill Qdrant with multi-vector payload
-- (Script: scripts/atlas/backfill-qdrant-multi-vector.mjs)
node scripts/atlas/backfill-qdrant-multi-vector.mjs --apply

-- Step 4: Enable multi-vector search in ACE
-- (Update: src/lib/server/ace/context-assembler.ts line 450+)
const stage_a0_candidates = await qdrant.search(
  collection: "codebase_chunks_768",
  vectors: {
    "content": query_embedding_768,
    "latent_64": ae_encode(query_embedding_768)
  },
  filter: {
    metadata: {
      "ae_confidence": { gte: 0.8 },
      "domain_class": context.domain  // Optional
    }
  }
);
```

---

## Summary: What We're Doing vs What's Missing

| Component | Current | Missing | Impact | Fix Timeline |
|-----------|---------|---------|--------|--------------|
| **Qdrant collision repair** | 75 broken packets | Unique IDs per packet | Retrieval corrupted | TODAY (Path A, 60 min) |
| **Multi-vector search** | Single 768-dim vector | latent_64 + summary vectors | Speed + semantics | NEXT (2 hours) |
| **Metadata filtering** | Payload tags only | Searchable metadata indexes | ACE confidence gates | NEXT (1 hour) |
| **AE acceleration** | AE frozen, not indexed | latent_64 pgvector index + Qdrant multi-vector | 150ms latency saved | NEXT (1 hour) |
| **ACE/KAG/DAG hits** | Neo4j + Qdrant only | Concept vectors + dependency reranking | Better context quality | DEFERRED (Phase 22) |

---

## Recommended Execution Order

1. ✅ **TODAY**: Fix P3g collisions (75 packets, ~60 min)
2. ⏳ **NEXT (90 min)**: Add latent_64_embedding to Postgres + backfill Qdrant multi-vector
3. ⏳ **NEXT (60 min)**: Enable multi-vector search in ACE context-assembler
4. ⏳ **NEXT (30 min)**: Verify retrieval E2E with multi-vector (benchmark)
5. 📋 **Phase 22**: Concept embedding + dependency reranking (deferred, eval gated)

---

**File type**: Markdown analysis  
**Status**: SESSION 72 PRE-PHASE-A BASELINE  
**Next action**: Approve Path A (collision repair), then Phase 2 (multi-vector wiring)
