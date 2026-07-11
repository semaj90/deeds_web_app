# Parent Atlas Training Readiness

Generated: 2026-07-11T07:16:12.700Z
Overall: READY_WITH_BLOCKERS

## Promotion Decisions

- arrow_batch_export: PASS
- qlora_semantic_dataset: BLOCKED
- autoencoder_training: BLOCKED
- packet_jepa_reranker: BLOCKED
- gpu_topology_mapreduce: BLOCKED
- hyperrag_packet_materialization: PASS
- tree_fanout_full_parity: BLOCKED

## Gates

| Gate | Status | Evidence |
|---|---:|---|
| packet identity uniqueness | PASS | 58365/58365 distinct packet_key |
| canonical labels and tree lineage | PASS | tree=100%, feature=100%, domain=100% |
| lexical and concept evidence | PASS | concepts=99.9914%, lexical=99.9846% |
| AST structural evidence | WARN | 3.7419% |
| summary coverage | FAIL | 7.1618% |
| canonical embedding coverage | FAIL | 0.0171% |
| SOM 20x20 packet coverage | FAIL | 7.1721% |
| Arrow IPC replay | PASS | 200 rows, 48 columns, 0 failures |
| Qdrant tree fan-out mirror | PASS_BOUNDED | 20/20 direct tree IDs matched |
| Neo4j tree fan-out mirror | PASS_BOUNDED | 18811 HAS_TREE_NODE edges; tree-only=true |
| native CUDA addon | PASS | C:\Users\james\Videos\deeds-web-app\simd-bridge\cpp\build\Release\tensorrt_bridge.node |
| Python CUDA training lane | PASS | 2.13.0+cu130 |
| JEPA promotion | BLOCKED | MRR 0.7443 vs 0.7761; NDCG@10 0.7818 vs 0.7985 |

## Status Model

- canonical packet and feature joins: PROVEN - live Postgres counts plus bounded Arrow replay
- Arrow IPC batch transport: PROVEN - 200-row file round-trip with identity/vector checks
- HyperRAG MsgPack/mmap hot packet path: PROVEN_BOUNDED - bounded materializer dry-run/apply evidence; not a full-corpus promotion
- tree_node_id fan-out: PROVEN_BOUNDED - Qdrant direct payload readback plus Neo4j HAS_TREE_NODE graphify
- QLoRA semantic training corpus: WIRED_BLOCKED - labels are complete; summaries and AST evidence remain incomplete
- Packet-JEPA: PROVEN_NOT_PROMOTED - held-out MRR and NDCG@10 do not beat baseline
- native CUDA addon: PROVEN - native addon smoke result
- Python CUDA / RAPIDS topology workers: PROVEN - repo venv remains CPU-only; RAPIDS stays WSL2-targeted

## Next Actions

1. Backfill canonical packet embeddings in bounded batches; do not train AE/JEPA on mixed latent fallbacks.
2. Expand AST symbol extraction from the current low-coverage structural cohort before QLoRA topic training.
3. Raise summary coverage with bounded Gemma4 synthesis, preserving packet_key and source_ref provenance.
4. Recompute KMeans/SOM only after the embedding cohort is canonical and versioned.
5. Widen Qdrant and Neo4j tree-node mirrors in bounded batches until full parity gates pass.
6. Install CUDA-enabled PyTorch in the dedicated training environment; keep RAPIDS/cuVS in WSL2.
7. Re-run JEPA on the same deterministic split and promote only if both MRR and NDCG@10 beat baseline.

