# Topology + Admin Thoughts (Updated June 2, 2026)

Timestamp: `2026-05-08 23:30:42` → Updated `2026-06-02`

## Current priority

- Fix topology retrieval semantics before adding more agent features.
- Keep `:8090` reserved for TurboQuant / llama-server generation.
- Keep rerank on a separate URL and degrade cleanly when unavailable.

## Canonical Embedding Dimension (VERIFIED)

**384-dimensional is the project-canonical retrieval truth.**

- `embedding_384` → Postgres pgvector (canonical)
- `embedding_384` → Qdrant vector index (mirror)
- `embedding_384` → RRF semantic signal (fp32 blend)
- Loaded from: `codebase_chunk_index.content_embedding` (halfvec 768 → truncated to fp32 384)
- Model: `embeddinggemma:latest` (384-dim native output)

**If you later migrate to 768-dimensional embeddings**: treat it as a versioned migration (`embedding_v2_768`) with a coordinated rebuild of the vector indexes, not a silent replacement of the current contract.

## Vector Storage Tiers (VERIFIED)

| Dimension | Purpose | Storage | Truth? | Tier |
|-----------|---------|---------|--------|------|
| **384** | Dense retrieval | Postgres pgvector, Qdrant, RRF blend | ✅ YES | Hot (canonical) |
| **128** | Semantic compression | (deferred) | ❌ NO | Planning |
| **64** | Topology/routing bonus | Redis cache only | ❌ NO | Warm (routing only) |
| **som_cluster** | Neighborhood pointer | Postgres metadata | ❌ NO | Metadata |
| **manifold4** | Visualization/provenance | Metadata/CouchDB | ❌ NO | Cold |

## Retrieval Pipeline (VERIFIED ORDER)

```
Query (text)
  → embed query (384-dim)
  → Redis exact cache (L1, 5ms)
  → Qdrant ANN (768-d named-vector) OR pgvector (384-d direct) (20 candidates, 100ms)
  → Neo4j topology bonus (USED_CONCEPT edges, PageRank) (10–20 results)
  → RRF fp32 blend (0.45·lexical + 0.35·vector + 0.20·authority) (rank deterministically)
  → (optional) GPU rerank (LibTorch cosine, 64 candidates)
  → Gemma4 synthesis (bounded context, 4–8 final results)
```

**Key**: Neo4j is contributing an **authority/topology signal**, not replacing Qdrant ANN. Vector + graph are complementary lanes.

## Tensor Pipeline (JSON/MsgPack/gRPC → GPU)

**Rule**: Convert only numeric payload, not the whole envelope.

```
Packet JSON/MsgPack/gRPC
  → parse envelope (validate packet_id, source_ref, feature_id)
  → extract embedding_384 field
  → Float32Array (validate dim = 384)
  → Tensor [rows, 384]
  → LibTorch / CUDA operations (k-means, distance matrix, SOM assignment)
  → Metadata write (som_cluster, topology, etc.)
  → Postgres update
  → Redis invalidate
```

**Do NOT tensorize**: packet_id, source_ref, metadata JSONB, title, summary, tags. Keep these in sidecar maps.

**Example**: 40,568 packets × 384 floats = Float32Array(15,578,112) = tensor [40568, 384] = 59.4 MB memory

## Retrieval rules (UPDATED)

- `384d embedding` → canonical dense retrieval vector (Postgres/Qdrant/RRF source)
- `som_bmu_row` / `som_bmu_col` → SOM neighborhood expansion (topology routing, not search)
- `manifold4` → visualization/provenance metadata (4D proximity, history tracking)
- `PageRank` / `community_id` → tie-break and explanation (Neo4j authority signal)
- `gpu.rerank` → optional final precision layer (LibTorch cosine similarity)

## Packet Identity (IMMUTABLE)

```
packet_key
  ← source_ref
  ← directory_path
  ← feature_id
  ← feature_label
```

**Everything else is enrichment.** This chain never changes.

## Cold/Warm/Hot Storage (TIERING RULE)

| Tier | Storage | Purpose | Max latency |
|------|---------|---------|-------------|
| **Hot** | Redis (BitFrost) + Qdrant | Cache + active retrieval | 5–100ms |
| **Warm** | Postgres (pgvector) | Canonical truth + recent enrichment | 10–500ms |
| **Cold** | SeaweedFS + DuckDB + CouchDB | Archive + offline analytics | 1–10s |

**Never retrieve directly from cold storage during normal search.** Cold storage is for audit trails, recompute, and export only.

## Known blocker

- `embedded_summaries` currently does not expose a 384d embedding column in Postgres.
- Current repair path: re-generate embeddings from codebase_chunk_index (canonical), NOT from atlas_packets.

## Admin chat notes

- Restored the admin chat files instead of deleting them.
- They are not the focus of this pass, but they are preserved so they can be edited later.

## Next topology follow-ups

- Add explicit BMU coverage / manifold4 coverage reporting.
- Add `topology.recompute_manifold` hydration/backfill path.
- If a true reranker service is introduced, point `RERANK_BASE_URL` to it.
- Implement tensor pipeline for large-scale packet processing (Step 6 and beyond).
- Cache Karpathy blend scores in Redis (0.4·PageRank + 0.3·attention + 0.3·authority).
