# PyTorch Training Pipeline

**Timestamp**: 2026-06-13T22:03:33.842Z
**Mode**: DRY-RUN

## Overview

This pipeline trains two PyTorch models on GPU:
1. **Autoencoder (768→256→64)**: Reduce embedding dimensionality for faster retrieval
2. **SOM (20×20)**: Topology-aware clustering for neighborhood queries

## Training Sequence


### Phase 1: Data Collection
**Duration**: 10 min

Tasks:
- Verify ≥1000 embeddings available in Qdrant codebase_chunks_768
- Query trace_atlas_packet_search for content embeddings
- Validate embedding dimensionality (must be 768)
- Store training data locally (CSV or Arrow format)

**Success Gate**: training_data.csv exists with ≥1000 rows × 768 cols


### Phase 2: Autoencoder Training
**Duration**: 15–30 min

Tasks:
- Initialize VAE (768→256→64→256→768)
- Train for 10–20 epochs on GPU
- Monitor reconstruction loss + KL divergence
- Evaluate on validation set (target: loss < 0.05)
- Export to TorchScript + TensorRT

**Success Gate**: NDCG on latent_64 clusters ≥0.65 OR reconstruction loss <0.05


### Phase 3: Latent Vector Backfill
**Duration**: 10 min

Tasks:
- Load trained autoencoder model
- Encode all atlas_packets embeddings → latent_64
- Upsert to Postgres atlas_packets.payload.latent_64 (JSONB)
- Verify 100% coverage (no NULL latent vectors)

**Success Gate**: atlas_packets with latent_64 ≥99%


### Phase 4: SOM Training
**Duration**: 10 min

Tasks:
- Initialize 20×20 SOM grid
- Train on latent_64 vectors
- Compute BMU for each vector → som_row, som_col, som_index
- Evaluate clustering quality (target: silhouette ≥0.30)

**Success Gate**: SOM weights saved + topology JSON generated


### Phase 5: Topology Backfill
**Duration**: 10 min

Tasks:
- Upsert som_row, som_col, som_index to atlas_packets.payload
- Create Neo4j SIMILAR_TOPOLOGY edges (adjacent cells in SOM grid)
- Verify Neo4j edge count ≥ (cells × 8 / 2) = ~1600 edges

**Success Gate**: atlas_packets with som_* ≥99%, Neo4j edges ≥1600


### Phase 6: Integration & Validation
**Duration**: 10 min

Tasks:
- Smoke test: retrieval query uses latent_64 for reranking
- Verify SOM topology in Neo4j via Cypher query
- Run ACE context assembler smoke test
- Measure cache hit rate on retrieval with new signals

**Success Gate**: Retrieval latency ≤500ms with SOM prefilter active


## MCP Integration Points

- **Data Retrieval**: `trace_atlas_packet_search` for embeddings
- **Storage**: `atlas_packets` upsert with latent_64 / som_* payloads
- **Graph**: Neo4j `SIMILAR_TOPOLOGY` edges from SOM grid adjacency
- **Events**: Analytics `embeddings_trained` event on completion

## Dependencies

**Before start**:
- XGBoost reranker trained (Stage 4)
- Proto/RPC tools packetized (Stage 2)
- Concept evidence spine complete

**Blocking**:
- atlas_packets table exists with embedding column
- Qdrant codebase_chunks_768 collection available
- Neo4j instance running with GDS plugin
- LibTorch bridge available (N-API tensorrt_bridge.node)

## Next Steps

After completion:
1. Reward prior backfill (populate reward_prior on packets without traces)
1. PyTorch policy sidecar scaffold (Stage 5 agent action selector)
1. Graph refresh invalidation binding
1. Cold storage restore verification

## Status

**DRY-RUN**: Pipeline structure validated. Ready for Phase 2 implementation.
