# Parent Atlas Graph Validation Fabric — GRAPH_SNAPSHOT_PARITY

**Status**: GUIDANCE RECORDED, NOT STARTED. This change captures detailed operator guidance
relayed mid-session (2026-08-11) for the *other* concurrent session working the Louvain/GS1_12
identity lane — not executed here. Recorded so the design isn't lost between sessions. Whoever
picks this up should treat it as a spec to implement against, not evidence anything below exists
yet.

## Core principle

One bounded graph *validation* fabric, deliberately kept **out of canonical identity ownership**.
Neo4j stays the live graph projection owner throughout. NetworkX is the CPU oracle. `nx-parallel`
is opportunistic CPU acceleration for the specific functions it implements (not a universal
accelerator — NetworkX backend dispatch is per-function, not per-library; check
`algorithm_support` per function, never assume). `nx-cugraph` is convenient RTX dispatch via the
same NetworkX API. Direct `cugraph` is the serious GPU runtime candidate. All four **consume the
same frozen snapshot** (`graph_snapshot`: `nodes.parquet` + `edges.parquet` + `manifest.json`,
one `graph_revision`) — no backend queries Neo4j independently during a parity run, or you're
comparing algorithms and source graphs simultaneously.

## One execution owner, many modes

Don't create separate `pagerank_gpu.py` / `louvain_gpu.py` / `networkx_worker.py` / `graph_cuda.py`
scripts. Extend the existing canonical GPU benchmark worker (`scripts/atlas/gpu/` /
`run_fabric_benchmark.py`, already in this repo — see the Ampere quantization proof kit
integrated earlier this session) with additional explicit modes:

```
graph_snapshot_validate, graph_backend_probe,
graph_pagerank_cpu, graph_pagerank_nx_cugraph, graph_pagerank_cugraph,
graph_louvain_cpu, graph_louvain_nx_cugraph, graph_louvain_cugraph,
graph_leiden_cugraph, graph_hits_cugraph, graph_bfs_parity, graph_sssp_parity,
(existing: fp32_exact, kmeans_runtime_eval, ampere_int4_cache_eval, som_runtime_eval)
```

## Build order (do not skip or reorder)

1. `GRAPH_SNAPSHOT_PARITY` validator — node/edge counts match manifest, table hashes match,
   `gpu_node_id` unique, `graph_node_key` unique per contract, no dangling edges, all weights
   finite, and critically: `source_revision`/`packet_key`/`symbol_id`/`symbol_version_id` are
   **never manufactured** by this validator. Receipt: `receipt_kind: graph_snapshot_parity`,
   `status: PROVEN` only after every check passes.
2. Backend capability probe (`GRAPH_BACKEND_PROBE`) — report what's actually installed/available
   per function (`networkx_version`, `nx_parallel_available`, `nx_cugraph_available`,
   `cudf_available`, `cugraph_available`, `cuda_available`, `gpu_name`, and an
   `algorithm_support` table keyed by algorithm × backend). Policy for anything not proven
   available: `UNSUPPORTED`/`FAILED`, never assumed.
3. NetworkX CPU oracle — PageRank first, with `alpha`/`max_iter`/`tol` explicitly recorded (not
   left at defaults). Receipt includes `top10`/`top100`/`top1000` + `result_hash`.
4. `nx-cugraph` PageRank parity — same semantic call via `backend='cugraph'`, compare against the
   CPU oracle: `top10/100/1000_overlap`, `spearman_rank_correlation`, `mean/max_abs_score_delta`,
   `speedup`. Promotion requires agreement AND operational value — not merely "GPU completed."
5. Direct `cugraph` PageRank parity — construct via `cudf`/`cugraph.Graph` directly (not through a
   NetworkX object first). Gives three-way comparison: CPU reference, API-compatible GPU dispatch
   proof, and the actual production performance candidate.
6. Louvain parity — **never compare community labels directly** (arbitrary numeric IDs are
   meaningless across runs/backends). Compare `community_count`, `modularity`,
   `community_size_distribution`, Adjusted Rand Index, Normalized Mutual Information, pairwise
   same-community agreement. Hard requirement: NetworkX's cuGraph Louvain backend documents that
   `seed` is ignored and self-loops are unsupported — this MUST appear explicitly in the parity
   receipt (`requested_seed`, `backend_seed_supported`, `self_loop_policy`), not surface later as
   a mystery mismatch.
7. Leiden — run only as an experiment after Louvain parity succeeds, evaluated on downstream
   value (modularity, cohesion, retrieval Recall@K, cross-run stability), never as an automatic
   replacement.
8. HITS / BFS / SSSP — feed `RetrievalCandidateFeatureMatrixV1`, not identity.
9. Retrieval ablation: `semantic_768` alone → +PageRank → +Louvain → +AST → +SOM/Manhattan,
   measured on Recall@10/50/100, MRR, NDCG@10, candidate reduction, latency, and downstream
   packet-use/execution-success signal — proves the graph actually improves synthesis, not just
   that the algorithms run.
10. Only after all of the above: consider promoting direct `cugraph` as a runtime graph-compute
    owner. Until then this whole fabric stays a **validation lane**, not a production dependency.

## CPU budget discipline (separate concern, same session's guidance)

Graphify's Node `worker_threads` pool (tree-sitter chunker, structural hashing, pure feature
extraction) is a **different pool** from any Python/NetworkX/cuGraph CPU work — don't let both
run heavy simultaneously. One heavy-compute family owns the CPU/GPU budget at a time
(`GRAPHIFY_HEAVY` → Python graph benchmarks idle; `GRAPH_HEAVY` → Graphify workers reduced;
`NEO4J_GDS_HEAVY` → don't concurrently benchmark CPU NetworkX). Benchmark worker counts
(2/4/6/8) empirically rather than assuming more cores helps — GDS Community Edition caps
algorithm concurrency at 4 cores regardless, so the first place added cores likely pay off is
Graphify preprocessing, not Neo4j Louvain.

## Explicit non-goals for this change

- Does not touch canonical packet/symbol identity ownership.
- Does not promote any GPU backend as a default without passing the full parity chain.
- Does not replace Neo4j as the live graph projection owner.
- Does not start until the Louvain reconciliation lane (`LOUVAIN_PACKET_RESOLUTION_RECEIPT_PROVEN`,
  owned by the concurrent session) reaches `replaySafe: true` and the resolver is frozen — this
  fabric is explicitly sequenced *after* that, not concurrent with it.
