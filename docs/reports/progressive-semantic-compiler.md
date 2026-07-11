# Progressive Semantic Compiler Validation

Generated: 2026-07-11T05:24:36.347Z
Overall: READY_WITH_BLOCKERS

## Gate Summary

| Gate | Status | Evidence |
|---|---:|---|
| packet identity spine | PASS | 100% source_ref, 100% tree_node_id |
| feature envelope coverage | FAIL | used_concepts=99.9914%, lexical=99.9846%, ast=0.8841% |
| metric lane coverage | FAIL | density=100%, complexity=100%, semantic_entropy=100% |
| summary coverage | FAIL | 7.1618% |
| canonical embedding coverage | FAIL | 0.0171% |
| latent_64 coverage | FAIL | 2.1417% |
| SOM 20x20 packet coverage | FAIL | 7.1721% |
| qdrant_point_id bridge | FAIL | 8.075% |
| Qdrant tree fan-out mirror | PASS_BOUNDED | 20/20 direct tree IDs matched |
| Neo4j tree fan-out mirror | PASS_BOUNDED | 18811 HAS_TREE_NODE edges; tree-only=true |

## Coverage

- source_ref: 100%
- feature_id: 100%
- title_id: 100%
- tree_node_id: 100%
- domain_class: 100%
- summary: 7.1618%
- embedding: 0.0171%
- latent_64: 2.1417%
- som_20x20: 7.1721%
- qdrant_point_id: 8.075%
- used_concepts: 99.9914%
- lexical_features: 99.9846%
- ast_symbols: 0.8841%
- metric_feature_density: 100%
- metric_complexity_score: 100%
- metric_semantic_entropy: 100%
- metric_retrieval_relevance: 100%
- metric_authority_score: 100%
- metric_kmeans_cluster: 0%

## Fan-Out Proof

- qdrant_tree_mirror: PASS
- neo4j_tree_mirror: PASS
- tree_node_id_is_fanout_join: PASS

## Status Model

- identity spine: PROVEN - packet_key + source_ref + title_id + tree_node_id
- feature compiler: WIRED_BLOCKED - used_concepts + lexical_features + ast_symbols
- metrics compiler: WIRED_BLOCKED - feature_density + complexity + semantic_entropy + authority
- topology ladder: WIRED_BLOCKED - latent_64 + SOM 20x20
- tree fan-out: PROVEN_BOUNDED - Qdrant tree payload mirror + Neo4j tree graph mirror
- retrieval readiness: WIRED_BLOCKED - Qdrant ids, summaries, embeddings

## Next Actions

1. Expand AST symbol extraction before promotion of semantic clustering lanes.
2. Raise summary and canonical embedding coverage before training any downstream reranker.
3. Widen the qdrant_point_id bridge in bounded batches, then re-run tree fan-out mirroring.
4. Keep tree_node_id as the packet-level fan-out join for Neo4j GDS, Qdrant payload filtering, and reranking.
5. Recompute KMeans/SOM only after the canonical embedding cohort is stable and versioned.

