# CPU-First Packet Retrieval Readiness

Generated: 2026-07-11T01:20:28.512Z
Status: LIVE_PASS

## Rule

Postgres owns packets. Qdrant finds vectors. RRF decides rank. Gemma4 summarizes. Redis caches. GPU accelerates only after correctness is proven.

## Lanes

- Postgres truth/indexes: LIVE_PASS
- Qdrant named-vector mirror: LIVE_PASS
- Redis/BitFrost cache surface: LIVE_PASS
- Code surfaces: LIVE_PASS

## Postgres Coverage

- atlas_packets: 58365
- packet_key: 100%
- source_ref: 100%
- feature_id: 100%
- source_ref_key: 100%
- qdrant_point_id: 8.08%
- packet summary: 7.16%
- pgvector embedding: 0.02%

## Qdrant

- collection: codebase_chunks_768
- points: 55117
- named vectors: content, error, signature
- content vector dim: 768

## Redis

- bifrost:*: 50
- bifrost:sem:packet:*: 25
- bifrost:sem:feature:*: 25
- ace:context:*: 25
- centroid:*: 0
- som:*: 0

## Later Acceleration Lanes

- TensorRT reranker
- ONNX Runtime GPU
- cuVS/TurboVec ANN accelerator
- LibTorch kmeans/SOM/AE/xgradient
