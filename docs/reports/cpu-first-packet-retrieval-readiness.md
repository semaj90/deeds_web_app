# CPU-First Packet Retrieval Readiness

Generated: 2026-09-04T17:38:35.247Z
Status: LIVE_PASS

## Rule

Postgres owns packets. Qdrant finds vectors. RRF decides rank. Gemma4 summarizes. Redis caches. GPU accelerates only after correctness is proven.

## Lanes

- Postgres truth/indexes: LIVE_PASS
- Qdrant named-vector mirror: LIVE_PASS
- Redis/BitFrost cache surface: LIVE_PASS
- Code surfaces: LIVE_PASS

## Postgres Coverage

- atlas_packets: 61715
- packet_key: 100%
- source_ref: 100%
- feature_id: 100%
- source_ref_key: 99.91%
- qdrant_point_id: 10.45%
- packet summary: 11.16%
- pgvector embedding: 99.91%

## Qdrant

- collection: codebase_chunks_768
- points: 109776
- named vectors: content, error, signature
- content vector dim: 768

## Redis

- bifrost:*: 46
- bifrost:sem:packet:*: 25
- bifrost:sem:feature:*: 21
- ace:context:*: 0
- centroid:*: 66
- som:*: 0

## Later Acceleration Lanes

- TensorRT reranker
- ONNX Runtime GPU
- cuVS/TurboVec ANN accelerator
- LibTorch kmeans/SOM/AE/xgradient
