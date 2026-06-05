# Compressed Semantic Geometry

_Date: 2026-06-05_

This note names the retrieval model used by Parent Atlas, Qdrant, TurboVec,
Redis LOD packets, and optional GPU rerank lanes:

```txt
compressed approximate semantic geometry with optional exact rescore
```

The phrase is intentionally narrow. It describes retrieval and packet replay,
not durable truth.

## Mental Model

Raw embeddings are high-detail semantic geometry. They are useful, but too large
to treat as the only hot runtime surface.

Qdrant quantization, TurboVec compression, Redis LOD packets, NES/CHROM
dictionaries, SOM clusters, and sourceRef payload filters are the lower-detail
geometry used to find likely candidates quickly.

The original file, Postgres ledger row, raw vector, and sourceRef-backed packet
remain the fidelity source. Compressed forms are acceleration surfaces.

## Stack Mapping

| Rendering concept | Atlas / retrieval equivalent |
|---|---|
| high-detail model | raw source file, sourceRef, full embedding |
| baked sprite / lower LOD | NES/CHROM compact packet, Redis LOD0, quantized vector |
| broad-phase bounds | HNSW, path filters, feature_id filters, SOM bucket |
| frustum culling | Qdrant payload filters before vector search |
| rough depth pass | quantized / approximate ANN candidate search |
| exact shading pass | original-vector rescore, TurboVec rerank, GPU cosine, Gemma4 synthesis |
| render manifest | Postgres packet registry and Parent Atlas ledger |

## Retrieval Order

The default retrieval sequence is:

```txt
sourceRef / feature_id / route / tags / date filters
  -> Qdrant HNSW + quantized or compressed candidate search
  -> dynamic oversampling based on query complexity
  -> optional exact rescore on the smaller candidate set
  -> Neo4j traversal expansion
  -> NES/CHROM packet assembly
  -> Gemma4 context
```

Filters come before vector math whenever possible. That keeps approximate search
inside the relevant semantic and provenance lane.

## Dynamic Oversampling

Oversampling is the retrieval equivalent of spending more detail only when the
view requires it.

Use a lower candidate multiplier when:

- the query has a strong `sourceRef`, `feature_id`, route, or table filter
- Redis exact packet lookup already found sourceRefs
- the top scores are separated clearly
- the request is a status, lookup, or replay query

Use a higher candidate multiplier when:

- the query spans multiple feature families
- sourceRefs are absent or ambiguous
- scores are clustered tightly
- graph expansion returns too few neighbors
- route runtime telemetry marks the request as low-context-density

## Exact Rescore Boundary

Exact rescore is optional and bounded. It belongs after the approximate pass,
not before it.

Allowed exact or higher-fidelity rescore lanes:

- Qdrant original-vector rescore when enabled by collection/search config
- TurboVec rerank behind the `SearchBackend.search()` result shape
- LibTorch `batchCosineSimilarity` / attention scoring
- Graph authority blend from Neo4j / PageRank / Karpathy scores
- Gemma4 synthesis over the final compact context pack

Do not use exact rescore to bypass provenance. Every result must still preserve
`sourceRef`, `feature_id`, packet id, and, where available, Qdrant point id.

## Storage Rules

- Postgres is the truth ledger.
- Qdrant is semantic lookup plus payload filtering.
- Redis / Bitfrost is hot packet and exact-hit reuse.
- Neo4j is contextual graph traversal.
- DuckDB is offline join analysis.
- NES/CHROM packets are compact replay surfaces.
- Original files stay cold or source-controlled until archive gates pass.

Do not treat a quantized vector, centroid id, Qdrant point id, or Redis key as
the canonical identity. The canonical join spine remains:

```txt
file_path -> stableKey -> sourceRef -> feature_id -> packetId
```

## What This Is Not

- It is not GPU JSON parsing.
- It is not route_runtime_packets doing matmul.
- It is not Qdrant becoming the source of truth.
- It is not a license to store large blobs in Redis or Qdrant.
- It is not a reason to add RAFT/cuVS/TensorRT lanes before the current packet
  contract is stable.

## Implementation Notes

Keep this model behind existing boundaries:

- callers use `retrieval/orchestrator.ts` or `search/qdrant-search.ts`
- Qdrant remains the default backend
- TurboVec stays optional behind the same result shape
- cuVS/CAGRA remains future work behind the same seam
- route runtime packets remain JSONB telemetry and replay indexes
- exact rescore must report whether it used approximate-only or approximate plus
  rescore

