# Phase 17-21 Workstation Audit

Generated: 2026-10-16T17:11:07.902Z
Status: PARTIAL

## Phase Matrix

| Phase | Status | Complete | Receipt-backed | What exists | What remains |
|---:|---|---:|---:|---|---|
| 17 | NOT_PROVEN | not established | no mapped receipts | PyTorch feature extractor and Python fallback exist. LibTorch/TensorRT bridge and CUDA-capable native surfaces exist. Current phase17 artifact contains 1 row(s). | Replace card-length heuristics with measured embedding/topology features. Use the proven retrieval corpus, not a one-row contract-card sample. Keep CUDA/GEMM as feature extraction acceleration, not packet identity. |
| 18 | NOT_PROVEN | not established | no mapped receipts | XGBoost reranker scripts and trained-sidecar lanes exist. Current phase18 compatibility artifact contains 1 row(s). | Use the validated retrieval/evaluation dataset as the training denominator. Require measured NDCG/MRR improvement before promotion. |
| 19 | NOT_PROVEN | not established | no mapped receipts | Append-only retrieval loop contains 443 rows. Neo4j, Qdrant, and Valkey mirrors have dedicated operational lanes. | Keep new events tied to replay_id, packet_key, source_ref, and outcome. Do not reuse pseudo-cosine events as evaluation truth. |
| 20 | NOT_PROVEN | not established | no mapped receipts | Zod validation: 3251/3251 addressable packets valid. Rust SIMD JSON and TurboVec N-API packet parsers exist. MapReduce NDJSON and DuckDB materialization artifacts exist. Postgres remains canonical; Qdrant/Valkey/Neo4j are mirrors. | Keep the Rust packet parser binary covered by snapshot tests. Keep streaming validation; do not load the 805 MB MapReduce artifact into normal JS objects. |
| 21 | NOT_PROVEN | not established | no mapped receipts | 50-query replay proof, cache namespace proof, runtime degradation proof, and final package gate pass. Policy/PPO and Gym-style scripts exist as research surfaces. | Build adversarial and tensor-analysis datasets from replayed traces. Open PPO/adapters only after a baseline-vs-candidate evaluation improves. Keep TensorRT/custom CUDA kernel work research-only until measured. |

## NDJSON And Storage

- Zod validation: 3251/3251 valid; 0 invalid.
- MapReduce NDJSON: 805352974 bytes.
- DuckDB mirror: 6565888 bytes.
- Rust SIMD/TurboVec parser available: yes.
- atlas_packet_parser packaged binary: yes.

## Gemma4 Batch Summary Lane

- batch: 500, concurrency: 1
- chat: llama-server / null
- embeddings: Ollama/EmbeddingGemma
- schema: NOT_PROBED
- summary coverage: 0% (0/0)
- dry: `npm run atlas:summaries:gemma4:500:dry`
- apply: `npm run atlas:summaries:gemma4:500:apply`

## Accelerator Boundary

- cuVS/CAGRA, RAPIDS, CUDA GEMM, LibTorch, AE, SOM, and KMeans may accelerate vector or topology analysis.
- They do not generate summary text and do not replace packet identity.
- ElectricSQL is not present and is not a tokenizer-remapping engine.

