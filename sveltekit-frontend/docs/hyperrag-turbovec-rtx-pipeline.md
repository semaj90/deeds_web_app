# Atlas × TurboVec × RTX CUDA Graph Stream Pipeline

## Architecture Overview

```
Query
  │
  ▼
[RotorQuant / TurboVec 4-bit ANN prefilter]   ← Python sidecar (port 8099)
  │  top-200 candidate IDs + scores
  ▼
[Qdrant Multi-Lane Dense Search]               ← codebase_chunks_768 / glyph_atlas
  │  4D manifold filter (topoClass, somRow, somCol, pageRank)
  ▼
[4D Topology → RTX CUDA Graph]                 ← tensorrt_bridge.node kmeansWithCentroids
  │  cluster centroids float32 stream
  ▼
[Atlas-fed RotorQuant Decode Stream]          ← llama.cpp rotorquant (port 8090, fed by Atlas compact chunks)
  │  final ranked context with trust tiers
  ▼
[Atlas Multi-Query Merge]                      ← kag.multi_lane_search MCP tool
  │  Atlas-ranked chunks + CouchDB wiki enrichment
  ▼
[Atlas Chunk Index / Log Triage]               ← Redis BoW tile + GRPO writeback
```

## TurboVec Verified ✅
- 4-bit quantization builds in 0.4s for 1000×64d vectors
- Search at 425ms (CPU) — GPU path via tensorrt_bridge for 768d production

## Pipeline Phases

### Phase A: RotorQuant Sidecar + TurboVec ANN
`scripts/rotorquant-turbovec-sidecar.mjs` — spawn Python sidecar, expose ANN API

### Phase B: 4D Qdrant Multi-Query with Cluster Prefilter
`scripts/hyperrag-dense-multiquery.mjs` — use saved manifold4 centroids from Redis to prefilter Qdrant before full dense search as part of the Atlas retrieval path

### Phase C: CouchDB Atlas Enrichment
Enrich results with wiki notes from `karpathy_wiki` CouchDB views, then fold them into the Atlas ranking pipeline

### Phase D: CUDA Graph Stream → Atlas-fed RotorQuant Decode Stream
Feed cluster centroids and Atlas compact chunks via `tensorrt_bridge.kmeansWithCentroids` → stream to the
Atlas-fed RotorQuant Decode Stream (llama.cpp rotorquant, port 8090) for speculative decoding

### Phase E: Atlas Chunk Index / Log Triage
Sidecar-loader pattern: small JSON sidecar per cluster with compressed summary, chunk_index, sorted by graph PageRank, logged to `logs/hyperrag-stream/` for audit
