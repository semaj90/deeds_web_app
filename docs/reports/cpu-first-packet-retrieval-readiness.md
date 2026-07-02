# CPU-First Packet Retrieval Readiness

Generated: 2026-07-02T04:06:51.642Z
Status: LIVE_PASS

## Rule

Postgres owns packets. Qdrant finds vectors. RRF decides rank. Gemma4 summarizes. Redis caches. GPU accelerates only after correctness is proven.

## Lanes

- Postgres truth/indexes: LIVE_PASS
- Qdrant named-vector mirror: LIVE_PASS
- Redis/BitFrost cache surface: LIVE_PASS
- Code surfaces: LIVE_PASS

## Postgres Coverage

- atlas_packets: 58304
- packet_key: 100%
- source_ref: 100%
- feature_id: 100%
- source_ref_key: 100%
- qdrant_point_id: 5.3%
- packet summary: 0.71%
- pgvector embedding: 0%

## Qdrant

- collection: codebase_chunks_768
- points: 40573
- named vectors: content, error, signature
- content vector dim: 768

## Redis

- bifrost:*: 55
- bifrost:sem:packet:*: 26
- bifrost:sem:feature:*: 28
- ace:context:*: 1
- centroid:*: 8
- som:*: 62

## Later Acceleration Lanes

- TensorRT reranker
- ONNX Runtime GPU
- cuVS/TurboVec ANN accelerator
- LibTorch kmeans/SOM/AE/xgradient
