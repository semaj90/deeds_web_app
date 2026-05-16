# TurboVec: Autoencoder-Driven Vector Routing Evaluation Plan

This document outlines the strategy for implementing and evaluating **TurboVec**, the compressed routing layer (Layer 2) of the Deeds Legal-AI retrieval architecture.

## 1. Architectural Context
TurboVec acts as a "router" between the raw user query and the canonical 768d vector store. It uses compressed embeddings (128d) to find relevant clusters/centroids before performing high-fidelity searches.

### The 4-Layer Retrieval Stack:
1. **Layer 1 (Truth)**: 768d `embeddinggemma` canonical embeddings (Qdrant/Postgres).
2. **Layer 2 (Routing)**: 128d compressed embeddings (TurboVec Autoencoder).
3. **Layer 3 (Hot Cache)**: Redis BitFrost (ACE cluster cards).
4. **Layer 4 (Relational)**: Neo4j KAG/DAG knowledge expansion.

## 2. Implementation Strategy

### Stage A: Model Registration & Canonical Store
- [x] Enrich `codebase_chunk_index` with `compressed_embedding`, `reconstruction_error`, and `centroid_id`.
- [x] Enrich `context_timeline` with `routing_cluster` and `reconstruction_error`.
- [ ] Implement `AutoencoderService` to handle `768d -> 128d` encoding.
- [ ] Populate `centroid_id` via k-means clustering on the existing 768d corpus.

### Stage B: Routing Logic
1. **Query Encoding**: Embed query (768d) -> Compress (128d).
2. **Centroid Match**: Find top N centroids in Layer 2.
3. **Fidelity Guard**: 
   - If `reconstruction_error < threshold`: Filter Qdrant search by `centroid_id`.
   - If `reconstruction_error >= threshold`: Fallback to global 768d Qdrant search.
4. **Reranking**: Rerank top 100 hits using the canonical 768d similarity + graph signals.

## 3. Evaluation Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **Routing Latency** | < 20ms | Time to identify target clusters vs global search. |
| **Recall@K (Compressed)** | > 95% | Parity with 768d global search for top 20 hits. |
| **Reconstruction Error** | < 0.05 | Mean Squared Error (MSE) of 128d -> 768d decoding. |
| **VRAM Footprint** | < 128MB | Memory usage of the routing index in Redis/RAM. |

## 4. Next Steps
1. **Warden Stress Test**: Validate 384-dim vs 768-dim performance under high concurrency.
2. **VLM Integration**: Finalize LangGraph orchestrator to use TurboVec clusters for evidence selection.
3. **Drift Reconciliation**: Apply manual migrations for the new schema fields.

---
**Status**: IN-PLANNING (Phase 9C)  
**Lead Agent**: Antigravity  
**Operator Review Required**: Yes
