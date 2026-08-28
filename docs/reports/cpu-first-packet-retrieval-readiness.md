# CPU-First Packet Retrieval Readiness

Generated: 2026-08-28T01:07:13.171Z
Status: WARN

## Rule

Postgres owns packets. Qdrant finds vectors. RRF decides rank. Gemma4 summarizes. Redis caches. GPU accelerates only after correctness is proven.

## Lanes

- Postgres truth/indexes: LIVE_PASS
- Qdrant named-vector mirror: LIVE_PASS
- Redis/BitFrost cache surface: WARN
- Code surfaces: LIVE_PASS

## Postgres Coverage

- atlas_packets: 61660
- packet_key: 100%
- source_ref: 100%
- feature_id: 100%
- source_ref_key: 100%
- qdrant_point_id: 10.46%
- packet summary: 11.17%
- pgvector embedding: 100%

## Qdrant

- collection: codebase_chunks_768
- points: 109129
- named vectors: content, error, signature
- content vector dim: 768

## Redis

- bifrost:*: 0
- bifrost:sem:packet:*: 0
- bifrost:sem:feature:*: 0
- ace:context:*: 0
- centroid:*: 0
- som:*: 0

## Later Acceleration Lanes

- TensorRT reranker
- ONNX Runtime GPU
- cuVS/TurboVec ANN accelerator
- LibTorch kmeans/SOM/AE/xgradient
